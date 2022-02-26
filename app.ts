import Homey, { DiscoveryStrategy } from 'homey';
import YandexQuasar from './lib/quasar';
import YandexSession from './lib/session';
import { YandexApp } from './types';

module.exports = class YandexAlice extends Homey.App implements YandexApp {
    session!: YandexSession;
    quasar!: YandexQuasar;
    discoveryStrategy!: DiscoveryStrategy;

    async onInit() {
        let settings = this.homey.settings;
        this.discoveryStrategy = this.homey.discovery.getStrategy("yandex_station");

        // Сессия
        this.session = new YandexSession();
        this.quasar = new YandexQuasar(this.session);

        this.session.on("available", async (status, onStartup) => {
            console.log(status ? "[Session] -> Успешная авторизация" : "[Приложение] -> Требуется повторная авторизация");
            if (!onStartup && status) await this.quasar.init();
            if (!status) ["x_token", "cookie", "music_token"].forEach(key => settings.set(key, ""));
        });

        this.session.on("update", (data) => {
            if (data) {
                Object.keys(data).forEach(key => {
                    console.log(`[Приложение] -> Сохранение ${key}`);
                    settings.set(key, data[key]);
                });
            }
        });

        await this.session.connect(settings.get("x_token") || "", settings.get("cookie") || "", settings.get("music_token") || "");
    }

    quasarInit = (() => {
        let executed = false;
        return async () => {
            if (!executed) {
                executed = true;
                await this.quasar.init();
            }
        }
    })();
}