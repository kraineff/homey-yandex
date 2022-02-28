import Homey from "homey";

import YandexSession from "./lib/session";
import YandexQuasar from "./lib/quasar";
import { YandexApp } from "./lib/types";

module.exports = class YandexAlice extends Homey.App implements YandexApp {
    session!: YandexSession;
    quasar!: YandexQuasar;
    discoveryStrategy = this.homey.discovery.getStrategy("yandex_station");

    async onInit() {
        this.session = new YandexSession();
        this.quasar = new YandexQuasar(this.session);

        // При обновлении статуса сессии
        this.session.on("available", async (status, onStartup) => {
            console.log(status ? "[Session] -> Успешная авторизация" : "[Приложение] -> Требуется повторная авторизация");

            if (!onStartup) status ? await this.quasar.init() : await this.quasar.close();
            if (!status) ["x_token", "cookie", "music_token"].forEach(key => this.homey.settings.set(key, ""));
        });

        // При обновлении данных сессии
        this.session.on("update", (data) => {
            if (data) {
                Object.keys(data).forEach(key => {
                    console.log(`[Приложение] -> Сохранение ${key}`);
                    this.homey.settings.set(key, data[key]);
                });
            }
        });

        // Подключение к сессии
        await this.session.init(
            this.homey.settings.get("x_token") || "",
            this.homey.settings.get("cookie") || "",
            this.homey.settings.get("music_token") || ""
        );


        // Триггер: получена команда
        const scenarioStartedTrigger = this.homey.flow.getTriggerCard("scenario_started");
        scenarioStartedTrigger.registerRunListener(async (args, state) => args.scenario.name === state.name);
        scenarioStartedTrigger.registerArgumentAutocompleteListener("scenario", async (query, args) => {
            const scenarios = this.quasar.scenarios.map(s => ({
                name: s.name,
                description: `${s.trigger} | ${s.action}`,
                image: s.icon
            }));

            return <any>scenarios.filter(result => result.name.toLowerCase().includes(query.toLowerCase()));
        })

        this.quasar.on("scenario_started", (data) => {
            const scenario = this.quasar.scenarios.find(s => s.action === data.capabilities[0].state.value);
            if (scenario) scenarioStartedTrigger.trigger(undefined, scenario);
        });
    }
}