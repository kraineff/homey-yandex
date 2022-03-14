import Yandex from "../yandex";
import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from 'ws';

export type RawDevice = {
    id: string
    name: string
    type: string
    icon_url: string
    capabilities?: any[]
    properties?: any[]
    quasar_info?: {
        device_id: string,
        platform: string
        multiroom_available: boolean
        multistep_scenarios_available: boolean
        device_discovery_methods: any[]
    }
    item_type: string
    groups: any[]
}

class DevicesWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            perMessageDeflate: false
        });
    }
}

export default class YandexDevices {
    yandex: Yandex;
    speakers: RawDevice[];
    devices: RawDevice[];

    rws!: ReconnectingWebSocket;
    updateInterval?: NodeJS.Timer;
    scenariosUpdateTimeout?: NodeJS.Timeout;

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this.speakers = [];
        this.devices = [];
    }

    getLights = () => this.devices.filter(device => ["devices.types.light"].includes(device.type));
    getSwitches = () => this.devices.filter(device => ["devices.types.switch", "devices.types.socket"].includes(device.type));
    getThermostats = () => this.devices.filter(device => ["devices.types.thermostat.ac", "devices.types.thermostat"].includes(device.type));
    getVacuums = () => this.devices.filter(device => ["devices.types.vacuum_cleaner"].includes(device.type));
    getHeaters = () => this.devices.filter(device => ["devices.types.cooking.kettle"].includes(device.type));
    getRemotes = () => this.devices.filter(device => ["devices.types.other"].includes(device.type));

    async init() {
        await this.update();
        await this.connect();
    }

    async update() {
        console.log("[Устройства] Обновление устройств");

        return this.yandex.get("https://iot.quasar.yandex.ru/m/user/devices").then(async resp => {
            const { rooms, speakers, unconfigured_devices }: { rooms: any[], speakers: any[], unconfigured_devices: any[] } = resp.data;
            
            const all: RawDevice[] = [...[].concat.apply([], rooms.map(({ devices }) => devices)), ...speakers, ...unconfigured_devices];
            this.speakers = all.filter(device => device.type.startsWith("devices.types.smart_speaker"));
            this.devices = await Promise.all(all
                .filter(device => !device.type.startsWith("devices.types.smart_speaker"))
                .map(async device => {
                    if (device.type === "devices.types.other") return (await this.yandex.get(`https://iot.quasar.yandex.ru/m/user/devices/${device.id}`)).data;
                    return device;
                })
            );
        });
    }

    async connect() {
        console.log(`[Устройства] -> Запуск обновления устройств`);

        const url = async () => this.yandex.get("https://iot.quasar.yandex.ru/m/v3/user/devices").then(resp => <string>resp.data.updates_url);
        
        this.rws = new ReconnectingWebSocket(url, [], { WebSocket: DevicesWebSocket });
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

    async close() {
        if (this.rws) {
            console.log(`[Устройства] -> Остановка обновления устройств`);
            if (this.updateInterval) clearInterval(this.updateInterval);
            this.rws.close();
        }
        this.yandex.removeAllListeners("update_state");
    }
}