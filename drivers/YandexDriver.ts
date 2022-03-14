import Homey from "homey";
import Yandex from "../lib/yandex";
import { RawDevice } from "../lib/modules/devices";

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
        
        pair.setHandler("start", async () => !this.yandex.ready ? await this.yandex.session.getAuthUrl() : "list_devices");
        pair.setHandler("check", async () => {
            ready = await this.yandex.session.checkAuth();
            return ready;
        });

        pair.setHandler("list_devices", async () => {
            if (ready) await this.yandex.connect();
            else await this.yandex.devices.update();

            const manifest = this.manifest;

            if (manifest.class === "speaker") {
                return this.yandex.devices.speakers ? this.yandex.devices.speakers
                    .filter(speaker => speaker.quasar_info!.platform === this.id)
                    .map(speaker => ({
                        name: speaker.name,
                        data: {
                            id: speaker.id,
                            device_id: speaker.quasar_info!.device_id
                        }
                    })) : [];
            } else {
                let devices;
                if (manifest.class === "socket") devices = this.yandex.devices.getSwitches();
                if (manifest.class === "remote") devices = this.yandex.devices.getRemotes();

                return devices ? devices.map(device => ({
                    name: device.name,
                    data: {
                        id: device.id
                    },
                    ...this.capabilitiesBuilder(device)
                })) : [];
            }
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