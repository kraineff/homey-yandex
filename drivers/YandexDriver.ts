import Homey from "homey";
import { RawDevice } from "../lib/devices/base";
import Yandex from "../lib/yandex";

export default class YandexDriver extends Homey.Driver {
    app!: Homey.App;
    yandex!: Yandex;
    
    async onInit(): Promise<void> {
        this.app = this.homey.app;
        //@ts-ignore
        this.yandex = this.app.yandex;
    }
    
    onPair(pair: Homey.Driver.PairSession) {
        let ready = false;
        
        pair.setHandler("start", async () => !this.yandex.ready ? await this.yandex.getAuthUrl() : "list_devices");
        pair.setHandler("check", async () => await this.yandex.checkAuth().then(() => ready = true));

        pair.setHandler("list_devices", async (after_auth: boolean) => {
            if (after_auth) await this.yandex.login();
            else await this.yandex.devices.refresh();

            const manifest = this.manifest;

            if (manifest.class === "speaker") {
                return this.yandex.devices.speakers
                    .filter(speaker => speaker.raw.quasar_info!.platform === this.id)
                    .map(speaker => ({
                        name: speaker.raw.name,
                        data: {
                            id: speaker.raw.id,
                            device_id: speaker.raw.quasar_info!.device_id
                        }
                    }));
            } else {
                let devices;
                if (manifest.class === "socket") devices = this.yandex.devices.switches;
                if (manifest.class === "remote") devices = this.yandex.devices.remotes;

                if (devices) return devices.map(device => ({
                    name: device.raw.name,
                    data: {
                        id: device.raw.id
                    },
                    ...this.capabilitiesBuilder(device.raw)
                }));
            }

            return [];
        });
    }

    capabilitiesBuilder(device: RawDevice) {
        const { capabilities, properties } = device;
        let _capabilities: string[] = [];
        let _capabilitiesOptions: any = {};

        if (capabilities) capabilities.forEach((capability: any) => {
            const { type, state, parameters } = capability;
            if (type === "devices.capabilities.on_off") _capabilities.push("onoff");
            if (parameters) {
                const { instance, name }: { instance: string, name: string } = parameters;
                if (instance && name && type === "devices.capabilities.custom.button") {
                    _capabilities.push(`button.${instance}`);
                    _capabilitiesOptions[`button.${instance}`] = { title: name };
                }
            }
        });

        if (properties) properties.forEach((property: any) => {
            const { parameters } = property;
            if (parameters) {
                if (parameters.instance === "voltage") _capabilities.push("measure_voltage");
                if (parameters.instance === "power") _capabilities.push("measure_power");
                if (parameters.instance === "amperage") _capabilities.push("measure_amperage");
            }
        });

        return {
            capabilities: [...this.manifest.capabilities, ..._capabilities],
            capabilitiesOptions: {...this.manifest.capabilitiesOptions, ..._capabilitiesOptions}
        };
    }
}