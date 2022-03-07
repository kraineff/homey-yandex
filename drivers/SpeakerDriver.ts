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

        // Начальный экран
        pair.setHandler("start", async () => {
            return !this.yandex.ready ? await this.yandex.getAuthUrl() : "list_devices";
        });

        // Проверка авторизации
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
                    // Основа
                    let base: any = {
                        name: speaker.name,
                        data: {
                            id: speaker.id
                        }
                    };

                    // Локальный режим
                    let discoveryResult: any = this.app.discoveryStrategy.getDiscoveryResults();
                    if (Object.keys(discoveryResult).includes(speaker.quasar.id)) {
                        let data: any = discoveryResult[speaker.quasar.id];
                        base.data["local_id"] = data.txt.deviceid;
                        base.store = {
                            address: data.address,
                            port: data.port
                        }
                    }

                    return base;
                });
        });
    }
}