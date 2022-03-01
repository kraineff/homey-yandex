import YandexSession from "./session";
import { Device, Speaker, SpeakerConfig } from "./types";

const USER_URL: string = "https://iot.quasar.yandex.ru/m/user";

export default class YandexDevices {
    session: YandexSession;

    devices!: Device[];
    speakers!: Speaker[];

    constructor(session: YandexSession) {
        this.session = session;
    }

    async init() {
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

        const all = [...rawDevices, ...response.speakers, ...response.unconfigured_devices].map(device => {
            let data: any = {
                id: device.id,
                name: device.name,
                type: device.type,
                icon: device.icon_url
            }

            if ("quasar_info" in device) data.quasar = {
                id: device.quasar_info.device_id,
                platform: device.quasar_info.platform
            }
            return data;
        });

        this.devices = all.filter(d => !("quasar" in d));
        this.speakers = all.filter(d => d.type.startsWith("devices.types.smart_speaker") && "quasar" in d);
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

    async getSpeakerConfig(speaker: Speaker) {
        console.log(`[Устройства: ${speaker.id}] -> Получение настроек`);

        let response = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.ru/get_device_config",
            params: { "device_id": speaker.quasar.id, "platform": speaker.quasar.platform }
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        return <SpeakerConfig>response.config;
    }

    async setSpeakerConfig(speaker: Speaker, config: SpeakerConfig) {
        console.log(`[Устройства: ${speaker.id}] -> Установка настроек`);

        let response = await this.session.request({
            method: "POST",
            url: "https://quasar.yandex.ru/set_device_config",
            params: { "device_id": speaker.quasar.id, "platform": speaker.quasar.platform },
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