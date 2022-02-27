import EventEmitter from "events";
import { client, connection } from "websocket";

import YandexSession from "./session";
import { DevicesResponse, GetDeviceConfigResponse, Scenario, YandexDevice, YandexDeviceConfig, YandexDeviceData } from "./types";


const USER_URL: string = "https://iot.quasar.yandex.ru/m/user";

export default class YandexQuasar extends EventEmitter {
    session: YandexSession;
    devices: YandexDevice[] = [];
    stats: any = {};
    connection?: connection;
    scenarios!: Scenario[];

    encode = (deviceId: string): string => {
        const MASK_EN = "0123456789abcdef-";
        const MASK_RU = "оеаинтсрвлкмдпуяю";

        return "ХОМЯК " + [...deviceId].map(char => MASK_RU[MASK_EN.indexOf(char)]).join("");
    }

    constructor(session: YandexSession) {
        super();
        this.session = session;
    }

    async init() {
        console.log("[Quasar] -> Обновление списка устройств");

        let response: DevicesResponse = await this.session.request({
            method: "GET",
            url: `${USER_URL}/devices`
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        let devices: YandexDevice[] = [];
        response.rooms.forEach(room => (<YandexDevice[]>room["devices"]).forEach(device => devices.push(device)));
        this.devices = [...devices, ...response.speakers, ...response.unconfigured_devices];

        await this.updateScenarios(await this.getScenarios());
        await this.connect();
    }

    async getScenarios() {
        let response = await this.session.request({
            method: "GET",
            url: `${USER_URL}/scenarios`
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;
        return response.scenarios;
    }

    async updateScenarios(scenarios: any[]) {
        console.log(`[Quasar] -> Обновление сценариев`);

        let ids = scenarios.map(s => s.id);

        let rawScenarios = await Promise.all(ids.map(async (id) => {
            let response = await this.session.request({
                method: "GET",
                url: `${USER_URL}/scenarios/${id}/edit`
            });
            return response?.status === "ok" ? response.scenario: {};
        }));

        this.scenarios = rawScenarios.map(s => ({
            name: s.name,
            trigger: s.triggers[0].value,
            action: s.steps[0].parameters.launch_devices[0].capabilities[0].state.value,
            icon: s.icon_url,
            id: s.id
        }));
    }

    async connect() {
        console.log(`[Quasar] -> Запуск получения команд`);

        let response = await this.session.request({
            method: "GET",
            url: "https://iot.quasar.yandex.ru/m/v3/user/devices"
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        if (this.connection?.connected) this.connection.close();
        let ws = new client();

        ws.on("connect", (connection: connection) => {
            this.connection = connection;
            
            this.connection.on("message", async (message) => {
                if (message.type === "utf8") {
                    let response = JSON.parse(message.utf8Data);

                    // if (response.operation === "update_scenario_list") await this.updateScenarios(JSON.parse(response.message).scenarios);

                    if (response.operation === "update_states") {
                        (<any[]>JSON.parse(response.message).updated_devices)
                            .filter(d => {
                                if (!d.hasOwnProperty("capabilities")) return false;
                                return (<any[]>d.capabilities).every(c => {
                                    if (!c.hasOwnProperty("state")) return false;
                                    if (c.type !== "devices.capabilities.quasar.server_action") return false;
                                    return true;
                                })
                            })
                            .forEach(d => this.emit("scenario_started", d));
                    }
                }
            });
        });

        ws.connect(response.updates_url);
    }

    async close() {
        if (this.connection?.connected) {
            console.log(`[Quasar] -> Остановка получения команд`);

            this.connection.close();
        }
    }

    rawSpeakers = () => this.devices.filter(device => device.type.startsWith("devices.types.smart_speaker"));

    async getSpeaker(deviceId: string): Promise<YandexDevice> {
        console.log(`[Quasar: ${deviceId}] -> Проверка scenario_id`);

        let scenario_id = this.scenarios.find(s => s.name === this.encode(deviceId))?.id || await this.addScenario(deviceId);
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
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

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
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/scenarios/${device.scenario_id}/actions`
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }

    async updateOnlineStats() {
        let response = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/devices_online_stats"
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        return response;
    }

    async getDevice(deviceId: string) {
        let response: YandexDeviceData = await this.session.request({
            method: "GET",
            url: `${USER_URL}/devices/${deviceId}`
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        return response;
    }

    async getDeviceConfig(device: YandexDevice): Promise<YandexDeviceConfig> {
        console.log(`[Quasar: ${device.id}] -> Получение настроек`);

        let response: GetDeviceConfigResponse = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/get_device_config",
            params: { "device_id": device.quasar_info.device_id, "platform": device.quasar_info.platform }
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

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
        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }
    
    async deviceAction(deviceId: string, actions: any ) {
        console.log(`[Quasar ${deviceId}] -> Выполнение действия (не колонка)`);

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

        let response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/devices/${deviceId}/actions`,
            data: { "actions": _actions }
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }
}