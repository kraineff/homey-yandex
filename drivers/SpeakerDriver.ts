import Homey from "homey";

import { YandexApp } from "../lib/types";
import Yandex from "../lib/yandex";

export default class SpeakerDriver extends Homey.Driver {
    app!: YandexApp;
    yandex!: Yandex;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.yandex = this.app.yandex;
    }
    
    onPair(pair: Homey.Driver.PairSession) {
        let ready = false;
        
        pair.setHandler("start", async () => !this.yandex.ready ? await this.yandex.getAuthUrl() : "list_devices");
        pair.setHandler("check", async () => {
            ready = await this.yandex.checkAuth();
            return ready;
        });

        pair.setHandler("list_devices", async () => {
            if (ready) await this.yandex.connect();
            else await this.yandex.devices.update();
            
            return this.yandex.devices.speakers
                .filter(speaker => speaker.quasar.platform === this.id)
                .map(speaker => {
                    return {
                        name: speaker.name,
                        data: {
                            id: speaker.id,
                            device_id: speaker.quasar.id
                        }
                    };
                });
        });
    }
}