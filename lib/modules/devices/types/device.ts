import Yandex from "../../../yandex";
import YandexDeviceBase from "./base";

export default class YandexDevice extends YandexDeviceBase {
    constructor (yandex: Yandex, id: string) {
        super(yandex, id);
    }

    async setAvailable() {
        this.yandex.updates.addListener("device_state", this.handleState);
        await super.setAvailable();
    }

    async setUnavailable(reason: "NO_AUTH" | "REMOVED" | "CLOSED" = "CLOSED") {
        this.yandex.updates.removeListener("device_state", this.handleState);
        await super.setUnavailable(reason);
    }

    private handleState = (state: any) => {
        if (state.id === this.id) this.emit("state", state);
    };

    async action(actions: any) {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.raw.id}] -> Выполнение действия -> ${JSON.stringify(actions)}`);
        
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
        });

        return this.yandex.session.post(`https://iot.quasar.yandex.ru/m/user/devices/${this.id}/actions`, {
            data: { "actions": _actions }
        });
    }
}