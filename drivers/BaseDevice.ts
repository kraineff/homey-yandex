import Homey from "homey";
import YandexDevice from "../lib/modules/devices/types/device";
import Yandex from "../lib/yandex"
import PromiseQueue from "promise-queue";
import { diff } from "deep-object-diff";
import { DeviceData } from "../lib/modules/devices/types";

export default class BaseDevice extends Homey.Device {
    app!: Homey.App;
    yandex!: Yandex;
    device!: YandexDevice;
    queue!: PromiseQueue;

    _listeners!: string[];

    async onInit(): Promise<void> {
        this.app = this.homey.app;
        //@ts-ignore
        this.yandex = this.app.yandex;
        this.queue = new PromiseQueue(1, Infinity);
        this._listeners = [];

        this.device = await this.yandex.devices.initDevice(this.getData().id);
        this.device.on("available", async () => {
            await this.update(this.device.data).then(async () => {
                await this.setAvailable();
                await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
            });
        });
        this.device.on("unavailable", async (reason: "NO_AUTH" | "REMOVED" | "CLOSED") => {
            if (reason === "NO_AUTH") await this.setUnavailable(this.homey.__("device.reauth_required"));
            if (reason === "REMOVED") await this.setUnavailable("Устройство больше не существует в Яндексе");
        });
        this.device.on("update", this.update);
        this.device.on("state", this.update);
    }

    async onDeleted(): Promise<void> {
        await this.device.setUnavailable();
    }

    update = async (data: DeviceData) => {
        const yandexCapabilities: any = {};
        const homeyCapabilities = this.getCapabilities().filter(capability => capability !== "button.reauth");
        
        if (data.capabilities) data.capabilities.forEach(capability => {
            const { type, state, parameters } = capability;

            if (state) {
                const check = (state.value || state.value === 0);
                if (state.instance === "on")
                    yandexCapabilities["onoff"] = check ? { value: state.value } : {};
                
                if (state.instance === "temperature")
                    yandexCapabilities["target_temperature"] = check ? { value: state.value } : {};
            }

            if (parameters) {
                if (type === "devices.capabilities.custom.button")
                    yandexCapabilities[`button.${parameters.instance}`] = { options: { title: parameters.name } };
            }
        });

        if (data.properties) data.properties.forEach(property => {
            const { state, parameters } = property;
            if (!parameters?.instance) return;
            const check = (state.value || state.value === 0);

            if (parameters.instance === "voltage")
                yandexCapabilities["measure_voltage"] = check ? { value: state.value } : {};
            
            if (parameters.instance === "power")
                yandexCapabilities["measure_power"] = check ? { value: state.value } : {};

            if (parameters.instance === "amperage")
                yandexCapabilities["measure_amperage"] = check ? { value: state.value } : {};
            
            if (parameters.instance === "temperature")
                yandexCapabilities["measure_temperature"] = check ? { value: state.value } : {};
            
            if (parameters.instance === "brightness")
                yandexCapabilities["dim"] = check ? { value: state.value / 100 } : {};
        });

        Object.keys(yandexCapabilities).forEach(async capability => {
            const params = yandexCapabilities[capability];

            if (!homeyCapabilities.includes(capability)) {
                console.log(`[Приложение: ${data.id}] -> Добавление свойства -> ${capability}`);
                await this.queue.add(() => this.addCapability(capability));
                if (params.options) await this.queue.add(() => this.setCapabilityOptions(capability, params.options));
            }

            if (params.value !== undefined && this.getCapabilityValue(capability) !== params.value)
                await this.queue.add(() => this.setCapabilityValue(capability, params.value));
            
            if (params.options !== undefined) {
                const difference = diff(this.getCapabilityOptions(capability), params.options);
                if (Object.keys(difference).length) {
                    console.log(`[Приложение: ${data.id}] -> Обновление свойства -> ${capability}`);
                    await this.queue.add(() => this.setCapabilityOptions(capability, params.options));
                }
            }
        });

        homeyCapabilities.forEach(async capability => {
            if (!Object.keys(yandexCapabilities).includes(capability)) {
                console.log(`[Приложение: ${data.id}] -> Удаление свойства -> ${capability}`);
                await this.queue.add(() => this.removeCapability(capability));
            }
        });

        return this.queue.add(this.onMultipleCapabilityListener);
    }

    onMultipleCapabilityListener = async () => {
        if (this.hasCapability("onoff") && !this._listeners.includes("onoff")) {
            this.registerCapabilityListener("onoff", async (value) => {
                await this.device.action({ "on": value });
            });
            this._listeners.push("onoff");
        }

        if (this.hasCapability("dim") && !this._listeners.includes("dim")) {
            this.registerCapabilityListener("dim", async (value) => {
                await this.device.action({ "brightness": value * 100 });
            });
            this._listeners.push("dim");
        }

        if (this.hasCapability("target_temperature") && !this._listeners.includes("target_temperature")) {
            this.registerCapabilityListener("target_temperature", async (value) => {
                await this.device.action({ "temperature": value * 100 });
            });
            this._listeners.push("target_temperature");
        }

        const buttons = this.getCapabilities().filter(c => c.startsWith("button.") && c !== "button.reauth").map(c => c.replace("button.", ""));
        if (buttons.length > 0) buttons.forEach(button => {
            if (this.hasCapability(`button.${button}`) && !this._listeners.includes(`button.${button}`)) {
                this.registerCapabilityListener(`button.${button}`, async () => {
                    await this.device.action({ [button]: true });
                });
                this._listeners.push(`button.${button}`);
            }
        });

        if (this.hasCapability("button.reauth") && !this._listeners.includes("button.reauth")) {
            this.registerCapabilityListener("button.reauth", async () => await this.yandex.logout());
            this._listeners.push("button.reauth");
        }
    }
}