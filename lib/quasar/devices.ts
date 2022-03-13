import { Device, DeviceTypes } from "../types";
import Yandex from "../yandex";

import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from 'ws';

export default class YandexDevices implements DeviceTypes {
    yandex: Yandex;
    rws!: ReconnectingWebSocket;

    speakers?: Device[];
    lights?: Device[];
    switches?: Device[];
    thermostats?: Device[];
    vacuums?: Device[];
    heaters?: Device[];
    remotes?: Device[];

    updateInterval?: NodeJS.Timer;
    scenariosUpdateTimeout?: NodeJS.Timeout;

    constructor(yandex: Yandex) {
        this.yandex = yandex;
    }

    async init() {
        await this.update();
        await this.connect();
    }

    getSpeaker = (deviceId: string) => this.speakers!.find(s => s.id === deviceId);

    async update() {
        console.log("[Устройства] Обновление устройств");

        return this.yandex.get("https://iot.quasar.yandex.ru/m/user/devices").then(async resp => {
            const { rooms, speakers, unconfigured_devices }: { rooms: any[], speakers: any[], unconfigured_devices: any[] } = resp.data;
            
            const all: Device[] = [...[].concat.apply([], rooms.map(({ devices }) => devices)), ...speakers, ...unconfigured_devices];
            this.speakers = all.filter(device => device.type.startsWith("devices.types.smart_speaker"));
            this.lights = all.filter(device => ["devices.types.light"].includes(device.type));
            this.switches = all.filter(device => ["devices.types.switch", "devices.types.socket"].includes(device.type));
            this.thermostats = all.filter(device => ["devices.types.thermostat.ac", "devices.types.thermostat"].includes(device.type));
            this.vacuums = all.filter(device => ["devices.types.vacuum_cleaner"].includes(device.type));
            this.heaters = all.filter(device => ["devices.types.cooking.kettle"].includes(device.type));
            this.remotes = await Promise.all(all
                .filter(device => ["devices.types.other"].includes(device.type))
                .map(async device => (await this.yandex.get(`https://iot.quasar.yandex.ru/m/user/devices/${device.id}`)).data));
        });
    }

    async connect() {
        console.log(`[Устройства] -> Запуск обновления устройств`);

        const url = async () => this.yandex.get("https://iot.quasar.yandex.ru/m/v3/user/devices").then(resp => <string>resp.data.updates_url);
        
        this.rws = new ReconnectingWebSocket(url, [], { WebSocket: WebSocket });
        //@ts-ignore
        this.rws.addEventListener("message", async (event) => {
            const data = JSON.parse(event.data);
            if (data.operation === "update_device_list")
                this.yandex.emit("update_devices");
            if (data.operation === "update_scenario_list") {
                if (this.scenariosUpdateTimeout) clearTimeout(this.scenariosUpdateTimeout);
                this.scenariosUpdateTimeout = setTimeout(async () => await this.yandex.scenarios.update(JSON.parse(data.message).scenarios), 1000);
            }
            if (data.operation === "update_states") {
                JSON.parse(data.message).updated_devices.forEach((device: any) => this.yandex.emit("update_state", device));
            }
        });

        this.updateInterval = setInterval(() => this.rws.reconnect(), 1 * 60 * 60 * 1000);
    }

    close() {
        if (this.rws) {
            console.log(`[Устройства] -> Остановка обновления устройств`);
            if (this.updateInterval) clearInterval(this.updateInterval);
            this.rws.close();
        }
    }
    
    async action(deviceId: string, actions: any ) {
        console.log(`[Устройства: ${deviceId}] -> Выполнение действия -> ${JSON.stringify(actions)}`);

        const IOT_TYPES: any = {
            "on": "devices.capabilities.on_off",
            "temperature": "devices.capabilities.range",
            "fan_speed": "devices.capabilities.mode",
            "thermostat": "devices.capabilities.mode",
            "heat": "devices.capabilities.mode",
            "volume": "devices.capabilities.range",
            "pause": "devices.capabilities.toggle",
            "mute": "devices.capabilities.toggle",
            "channel": "devices.capabilities.range",
            "input_source": "devices.capabilities.mode",
            "brightness": "devices.capabilities.range",
            "color": "devices.capabilities.color_setting",
            "work_speed": "devices.capabilities.mode",
            "humidity": "devices.capabilities.range",
            "ionization": "devices.capabilities.toggle",
            "backlight": "devices.capabilities.toggle",
            "keep_warm": "devices.capabilities.toggle",
            "tea_mode": "devices.capabilities.mode"
        }

        let _actions: any[] = [];
        Object.keys(actions).forEach(key => {
            let value = actions[key];
            let type = !isNaN(key as any) ? "devices.capabilities.custom.button" : IOT_TYPES[key];
            let state = ["volume", "channel"].includes(key) ? { "instance": key, "value": value, "relative": true } : { "instance": key, "value": value };
            _actions.push({ "type": type, "state": state });
        })

        return this.yandex.post(`https://iot.quasar.yandex.ru/m/user/devices/${deviceId}/actions`, {
            data: { "actions": _actions }
        });
    }
}