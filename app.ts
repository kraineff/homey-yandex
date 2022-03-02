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
        this.session.on("available", async (status) => {
            console.log(status ? "[Session] -> Успешная авторизация" : "[Приложение] -> Требуется повторная авторизация");

            if (!status) {
                if (this.quasar.ready) await this.quasar.close();
                ["x_token", "cookie", "music_token"].forEach(key => this.homey.settings.set(key, ""));
            }
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
        ).then(async (status) => {
            if (status) await this.quasar.init();
        });


        // Триггер: получена команда
        const scenarioStartedTrigger = this.homey.flow.getTriggerCard("scenario_started");
        scenarioStartedTrigger.registerRunListener(async (args, state) => args.scenario.name === state.name);
        scenarioStartedTrigger.registerArgumentAutocompleteListener("scenario", async (query, args) => {
            const scenarios = this.quasar.scenarios.scenarios
                .filter(s => !s.name.startsWith("ХОМЯК")).map(s => ({
                    name: s.name,
                    description: `${this.homey.__("scenario_phrase")}: ${s.trigger}`,
                    image: s.icon
                }));

            return <any>scenarios.filter(result => result.name.toLowerCase().includes(query.toLowerCase()));
        })

        this.quasar.scenarios.on("scenario_started", (data) => {
            const scenario = this.quasar.scenarios.getByAction(data.capabilities[0].state.value);
            if (scenario) scenarioStartedTrigger.trigger(undefined, scenario);
        });
    }
}