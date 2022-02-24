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
        });

        this.session.on("update", (data) => {
            if (data) {
                Object.keys(data).forEach(key => {
                    console.log(`[Приложение] -> Сохранение ${key}`);
                    settings.set(key, data[key]);
                });
            }
        });

        await this.session.connect(settings.get("x_token") || "", settings.get("cookie") || "", settings.get("music_token") || "").then(async (status) => {
            if (status) await this.quasar.init();
        });

        // Для тестеров (раскоментируйте код ниже, запустите приложение, перейдите по ссылки в консоли и авторизируйтесь, затем если пишет Успешно, перезапустите приложение.)

        // console.log(await this.session.getAuthUrl());
        // setInterval(async () => {
        //     let check = await this.session.checkAuth();
        //     if (check.status) console.log("Успешно!");
        // }, 5000);
    }
}