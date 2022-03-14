import Homey from "homey";
import Yandex from "../lib/yandex"
import YandexDevice from "../lib/devices/base";
import { RawDevice } from "../lib/modules/devices";

export default class BaseDevice extends Homey.Device {
    app!: Homey.App;
    yandex!: Yandex;
    device!: YandexDevice;

    async onInit(): Promise<void> {
        this.app = this.homey.app;
        //@ts-ignore
        this.yandex = this.app.yandex;

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.reauth_required"));

        this.yandex.on("ready", async () => await this.init());
        this.yandex.on("reauth_required", async () => await this.setUnavailable(this.homey.__("device.reauth_required")));
    }

    async onDeleted(): Promise<void> {
        await this.device.close();
    }

    async init() {
        await this.setAvailable();

        let devices: RawDevice[] = [];
        if (this.driver.manifest.class === "socket") devices = this.yandex.devices.getSwitches();
        if (this.driver.manifest.class === "remote") devices = this.yandex.devices.getRemotes();
        this.device = this.yandex.createDevice(this.getData().id);
        this.device.init();

        await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
        await this.setCapabilities(this.device.raw);
        this.device.on("update", async data => await this.setCapabilities(data));
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
            await this.device.action({ "on": value });
        });

        // Пульт
        const buttons = this.getCapabilities().filter(c => c.startsWith("button.") && c !== "button.reauth").map(c => c.replace("button.", ""));
        if (buttons.length > 0) buttons.forEach(button => this.registerCapabilityListener(`button.${button}`, async () => {
            await this.device.action({ [button]: true });
        }));

        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("reauth_required") });
    }
}