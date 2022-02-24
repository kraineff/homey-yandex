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
        

        // Действия Flow
        const tts = this.homey.flow.getActionCard('text_to_speech');
        tts.registerRunListener(async (args, state) => {
            await this.quasar.send(args.device.speaker, args["text"], true);
        });

        const send_command = this.homey.flow.getActionCard('send_command');
        send_command.registerRunListener(async (args, state) => {
            await this.quasar.send(args.device.speaker, args["command"]);
        });
    }
}