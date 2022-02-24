import YandexSession from "./session";
import { DevicesResponse, GetDeviceConfigResponse, Scenario, YandexDevice, YandexDeviceConfig, YandexDeviceData } from "../types";

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

const MASK_EN: string = "0123456789abcdef-";
const MASK_RU: string = "оеаинтсрвлкмдпуяы";

const USER_URL: string = "https://iot.quasar.yandex.ru/m/user";

export default class YandexQuasar {
    session: YandexSession;
    devices: YandexDevice[] = [];
    stats: any = {};

    constructor(session: YandexSession) {
        this.session = session;
    }

    async init() {
        console.log("[Quasar] -> Обновление списка устройств");

        let response: DevicesResponse = await this.session.request({
            method: "GET",
            url: `${USER_URL}/devices`
        });
        if (response.status !== "ok") throw response;

        let devices: YandexDevice[] = [];
        response.rooms.forEach(room => (<YandexDevice[]>room["devices"]).forEach(device => devices.push(device)));
        this.devices = [...devices, ...response.speakers, ...response.unconfigured_devices];
    }

    encode = (deviceId: string): string => "ХОМЯК " + [...deviceId].map(char => MASK_RU[MASK_EN.indexOf(char)]).join("");
    rawSpeakers = () => this.devices.filter(device => device.type.startsWith("devices.types.smart_speaker"));

    async getSpeaker(deviceId: string): Promise<YandexDevice> {
        console.log(`[Quasar: ${deviceId}] -> Проверка scenario_id`);

        let response = await this.session.request({
            method: "GET",
            url: `${USER_URL}/scenarios`
        });
        if (response.status !== "ok") throw response;

        let scenario_id = ((<Scenario[]>response.scenarios).find(s => s.name === this.encode(deviceId)))?.id || await this.addScenario(deviceId);
        return { ...this.rawSpeakers().find(s => s.id === deviceId)!, scenario_id }
    }
    
    async addScenario(deviceId: string): Promise<string> {
        console.log(`[Quasar: ${deviceId}] -> Добавление сценария`);

        let name = this.encode(deviceId);

        let response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/scenarios`,
            data: {
                name: name,
                icon: "home",
                triggers: [{ type: "scenario.trigger.voice", value: name.slice(6) }],
                steps: [{ type: "scenarios.steps.actions", parameters: {
                    requested_speaker_capabilities: [],
                    launch_devices: [{
                        id: deviceId,
                        capabilities: [{
                            type: "devices.capabilities.quasar.server_action",
                            state: { instance: "phrase_action", value: "пустышка" }
                        }]
                    }]
                }}]
            }
        });
        if (response.status !== "ok") throw response;

        return response.scenario_id;
    }

    async send(device: YandexDevice, message: string, isTTS: boolean = false) {
        console.log(`[Quasar: ${device.id}] -> Выполнение действия -> ${message}`);

        if (!device.scenario_id) return;
        let action = isTTS ? "phrase_action" : "text_action";
        let name = this.encode(device.id);

        let response = await this.session.request({
            method: "PUT",
            url: `${USER_URL}/scenarios/${device.scenario_id}`,
            data: {
                name: name,
                icon: "home",
                triggers: [{ type: "scenario.trigger.voice", value: name.slice(6) }],
                steps: [{ type: "scenarios.steps.actions", parameters: {
                    requested_speaker_capabilities: [],
                    launch_devices: [{
                        id: device.id,
                        capabilities: [{
                            type: "devices.capabilities.quasar.server_action",
                            state: { instance: action, value: message }
                        }]
                    }]
                }}]
            }
        });
        if (response.status !== "ok") throw response;

        response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/scenarios/${device.scenario_id}/actions`
        });
        if (response.status !== "ok") throw response;
    }

    async updateOnlineStats() {
        let response = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/devices_online_stats"
        });
        if (response.status !== "ok") throw response;
        return response;
    }

    async getDevice(deviceId: string) {
        let response: YandexDeviceData = await this.session.request({
            method: "GET",
            url: `${USER_URL}/devices/${deviceId}`
        });

        if (response.status !== "ok") throw response;
        return response;
    }

    async getDeviceConfig(device: YandexDevice): Promise<YandexDeviceConfig> {
        console.log(`[Quasar: ${device.id}] -> Получение настроек`);

        let response: GetDeviceConfigResponse = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/get_device_config",
            params: { "device_id": device.quasar_info.device_id, "platform": device.quasar_info.platform }
        });

        if (response.status !== "ok") throw response;
        return response.config;
    }

    async setDeviceConfig(device: YandexDevice, config: YandexDeviceConfig) {
        console.log(`[Quasar ${device.id}] -> Установка настроек`);

        let response = await this.session.request({
            method: "POST",
            url: "https://quasar.yandex.ru/set_device_config",
            params: { "device_id": device.quasar_info.device_id, "platform": device.quasar_info.platform },
            data: config
        });

        if (response.status !== "ok") throw response;
    }
    
    async deviceAction(deviceId: string, actions: any ) {
        console.log(`[Quasar ${deviceId}] -> Выполнение действия (не колонка)`);

        let _actions: any[] = [];

        Object.keys(actions).forEach(key => {
            let value = actions[key];
            let type = !isNaN(key as any) ? "devices.capabilities.custom.button" : IOT_TYPES[key];
            let state = ["volume", "channel"].includes(key) ? { "instance": key, "value": value, "relative": true } : { "instance": key, "value": value };
            _actions.push({ "type": type, "state": state });
        })

        let response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/devices/${deviceId}/actions`,
            data: { "actions": _actions }
        });

        if (response.status !== "ok") throw response;
    }
}