import Homey from "homey";

import YandexSession from "../lib/session";
import { YandexApp } from "../lib/types";

export default class SpeakerDriver extends Homey.Driver {
    app!: YandexApp;
    session!: YandexSession;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.session = this.app.session;
    }
    
    onPair(pair: Homey.Driver.PairSession) {
        let ready = false;

        // Начальный экран
        pair.setHandler("start", async () => {
            return !this.session.ready ? await this.session.getAuthUrl() : "list_devices";
        });

        // Проверка авторизации
        pair.setHandler("check", async () => {
            ready = await this.session.checkAuth();
            return ready;
        });

        pair.setHandler("list_devices", async () => {
            if (ready) await this.app.quasar.init().then(() => this.app.session.emit("available", true));
            else await this.app.quasar.devices.update();
            
            return this.app.quasar.devices.speakers
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