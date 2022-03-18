import Homey from "homey";
import Yandex from "../lib/yandex"
import YandexDevice from "../lib/devices/device";

export default class BaseDevice extends Homey.Device {
    app!: Homey.App;
    yandex!: Yandex;
    device!: YandexDevice;

    async onInit(): Promise<void> {
        this.app = this.homey.app;
        //@ts-ignore
        this.yandex = this.app.yandex;

        const _device = this.yandex.devices.getById(this.getData().id);
        if (_device) {
            this.device = <YandexDevice>_device;
            this.device.on("available", async () => {
                await this.setAvailable();
                await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
                await this.onCapabilityListener();
            });
            this.device.on("unavailable", async () => await this.setUnavailable(this.homey.__("device.reauth_required")));
            this.device.on("state", async (state) => await this.setCapabilities(state));
            await this.device.init();
        } else await this.setUnavailable("Устройство больше не существует");
    }

    async onDeleted(): Promise<void> {
        await this.device.destroy();
    }

    async setCapabilities(data: any) {
        const { capabilities, properties } = data;

        if (capabilities) capabilities.forEach(async (capability: any) => {
            const { state } = capability;
            if (state) {
                if (state.instance === "on" && this.getCapabilityValue("onoff") !== state.value)
                    await this.setCapabilityValue("onoff", state.value);
            }
        });

        if (properties) properties.forEach(async (property: any) => {
            const { state, parameters } = property;
            if (state && parameters) {
                // Розетка
                if (parameters.instance === "voltage" && this.getCapabilityValue("measure_voltage") !== state.value)
                    await this.setCapabilityValue("measure_voltage", state.value);
                if (parameters.instance === "power" && this.getCapabilityValue("measure_power") !== state.value)
                    await this.setCapabilityValue("measure_power", state.value);
                if (parameters.instance === "amperage" && this.getCapabilityValue("measure_amperage") !== state.value)
                    await this.setCapabilityValue("measure_amperage", state.value);
            }
        });
    }

    async onCapabilityListener() {
        if (this.hasCapability("onoff")) this.registerCapabilityListener("onoff", async (value) => {
            await this.device.action({ "on": value });
        });

        // Пульт
        const buttons = this.getCapabilities().filter(c => c.startsWith("button.") && c !== "button.reauth").map(c => c.replace("button.", ""));
        if (buttons.length > 0) buttons.forEach(button => this.registerCapabilityListener(`button.${button}`, async () => {
            await this.device.action({ [button]: true });
        }));

        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("close") });
    }
}