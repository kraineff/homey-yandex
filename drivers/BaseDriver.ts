import Homey from "homey";
import Yandex from "../lib/yandex";

export default class BaseDriver extends Homey.Driver {
    app!: Homey.App;
    yandex!: Yandex;
    
    async onInit(): Promise<void> {
        this.app = this.homey.app;
        //@ts-ignore
        this.yandex = this.app.yandex;
    }
    
    onPair(pair: Homey.Driver.PairSession) {        
        pair.setHandler("start", async () => !this.yandex.ready ? await this.yandex.session.getAuthUrl() : "list_devices");
        pair.setHandler("check", async () => await this.yandex.session.checkAuth());
        pair.setHandler("list_devices", async () => {
            const id = this.manifest.id;
            
            const devices = id.includes("device_") ?
                this.yandex.devices.getByType(id.replace("device_", "")) :
                this.yandex.devices.getByPlatform(id.replace("speaker_", ""));

            return devices.map(device => ({
                name: device.data.name,
                data: {
                    id: device.id
                },
                class: id.includes("device_") ? id.replace("device_", "") : "speaker"
            }));
        });
    }
}