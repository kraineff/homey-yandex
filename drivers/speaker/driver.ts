import Homey from "homey";

import YandexSession from "../../lib/session";
import { YandexApp } from "../../lib/types";

module.exports = class SpeakerDriver extends Homey.Driver {
    app!: YandexApp;
    session!: YandexSession;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.session = this.app.session;

        this.homey.flow.getActionCard('text_to_speech').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["text"], true);
        });

        this.homey.flow.getActionCard('send_command').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["command"]);
        });
    }
    
    onPair(pair: Homey.Driver.PairSession) {
        // Начальный экран
        pair.setHandler("start", async () => {
            return !this.session.ready ? await this.session.getAuthUrl() : "list_devices";
        });

        // Проверка авторизации
        pair.setHandler("check", async () => {
            return await this.session.checkAuth();
        });

        // Обновление квазара
        pair.setHandler("showView", async (viewId) => {
            if (viewId === "add_devices") await this.app.quasar.updateScenarios();
        });

        pair.setHandler("list_devices", async () => {
            await this.app.quasar.updateDevices();

            return this.app.quasar.rawSpeakers().map(speaker => {
                // Основа
                let base: any = {
                    name: speaker.name,
                    data: {
                        id: speaker.id
                    }
                };

                // Иконка
                let yandex = ["yandexmicro", "yandexmini_2", "yandexmini", "yandexstation_2", "yandexstation"];
                let other = ["elari_a98", "jbl_link_music", "jbl_link_portable", "lightcomm", "linkplay_a98", "prestigio_smart_mate", "wk7y"];
                if ([...yandex, ...other].includes(speaker.quasar.platform)) base.icon = `/${speaker.quasar.platform}.svg`;

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