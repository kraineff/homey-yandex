import YandexSession from "./session";
import { Device, DeviceConfig } from "./types";

const USER_URL: string = "https://iot.quasar.yandex.ru/m/user";

export default class YandexDevices {
    session: YandexSession;

    devices!: Device[];
    speakers!: Device[];

    constructor(session: YandexSession) {
        this.session = session;
    }

    async init() {
        console.log("[Quasar] -> Инициализация модуля устройств");

        await this.update();
    }

    getSpeaker = (deviceId: string) => this.speakers.find(s => s.id === deviceId);

    async update() {
        console.log("[Устройства] -> Обновление устройств");

        let response = await this.session.request({
            method: "GET",
            url: `${USER_URL}/devices`
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        let rawDevices: any[] = [];
        (<any[]>response.rooms).forEach(room => (<any[]>room["devices"]).forEach(device => rawDevices.push(device)));

        this.devices = [...rawDevices, ...response.speakers, ...response.unconfigured_devices].map(device => <Device>({
            id: device.id,
            name: device.name,
            type: device.type,
            icon: device.icon_url,
            quasar: {
                id: device.quasar_info.device_id,
                platform: device.quasar_info.platform
            }
        }));

        this.speakers = this.devices.filter(device => device.type.startsWith("devices.types.smart_speaker"));
    }

    async action(deviceId: string, actions: any ) {
        console.log(`[Устройства ${deviceId}] -> Выполнение действия (не колонка)`);

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

    async getConfig(device: Device) {
        console.log(`[Устройства: ${device.id}] -> Получение настроек`);

        let response = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/get_device_config",
            params: { "device_id": device.quasar.id, "platform": device.quasar.platform }
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        return <DeviceConfig>response.config;
    }

    async setConfig(device: Device, config: DeviceConfig) {
        console.log(`[Устройства: ${device.id}] -> Установка настроек`);

        let response = await this.session.request({
            method: "POST",
            url: "https://quasar.yandex.ru/set_device_config",
            params: { "device_id": device.quasar.id, "platform": device.quasar.platform },
            data: config
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }

    // async getDevice(deviceId: string) {
    //     let response = await this.session.request({
    //         method: "GET",
    //         url: `${USER_URL}/devices/${deviceId}`
    //     });
    //     if (response?.status !== "ok") throw `Ошибка: ${response}`;

    //     return response;
    // }
}