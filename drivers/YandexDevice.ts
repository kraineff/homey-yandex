import Homey from "homey";
import { classNames, Device, DeviceTypes, YandexApp } from "../lib/types";
import Yandex from "../lib/yandex"

export default class YandexDevice extends Homey.Device {
    app!: YandexApp;
    yandex!: Yandex;
    device!: Device;

    dataListener!: (data: any) => void;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.yandex = this.app.yandex;

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.reauth_required"));

        this.yandex.on("ready", async () => await this.init());
        this.yandex.on("reauth_required", async () => {
            this.yandex.removeListener("update_state", this.dataListener);
            await this.setUnavailable(this.homey.__("device.reauth_required"));
        });
    }

    onDeleted(): void {
        this.yandex.removeListener("update_state", this.dataListener);
    }

    async init() {
        this.device = this.yandex.devices[classNames[this.driver.manifest.class] as keyof DeviceTypes]!.find(device => device.id === this.getData().id)!;
        await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
        await this.setCapabilities(this.device);

        this.dataListener = async (data: any) => {
            if (data.id === this.getData().id) await this.setCapabilities(data);
        };
        this.yandex.addListener("update_state", this.dataListener);
        await this.onCapabilityListener();
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
            await this.yandex.devices.action(this.device.id, { "on": value });
        });

        // Пульт
        const buttons = this.getCapabilities().filter(c => c.startsWith("button.") && c !== "button.reauth").map(c => c.replace("button.", ""));
        if (buttons.length > 0) buttons.forEach(button => this.registerCapabilityListener(`button.${button}`, async () => {
            await this.yandex.devices.action(this.device.id, { [button]: true });
        }));

        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("reauth_required") });
    }
}