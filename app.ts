import Homey from "homey";

import { YandexApp } from "./lib/types";
import Yandex from "./lib/yandex";

module.exports = class YandexAlice extends Homey.App implements YandexApp {
    yandex!: Yandex;
    discoveryStrategy = this.homey.discovery.getStrategy("yandex_station");

    async onInit() {
        this.yandex = new Yandex(
            this.homey.settings.get("x_token") || "",
            this.homey.settings.get("cookies") || "",
            this.homey.settings.get("music_token") || ""
        );

        this.yandex.on("authRequired", () => {
            ["x_token", "cookies", "music_token"].forEach(key => this.homey.settings.set(key, ""));
        });

        this.yandex.on("update", data => {
            Object.keys(data).forEach(key => {
                console.log(`[Приложение] -> Сохранение ${key}`);
                this.homey.settings.set(key, data[key])
            });
        });

        await this.yandex.connect();

        // Действия: ТТС и команда
        this.homey.flow.getActionCard("text_to_speech").registerRunListener(async (args, state) => {
            await this.yandex.scenarios.send(args.device.speaker, args["text"], true);
        });

        this.homey.flow.getActionCard("send_command").registerRunListener(async (args, state) => {
            const device = args.device;
            const command = args["command"];

            if (!device.isLocal) await this.yandex.scenarios.send(device.speaker, command);
            else await device.glagol.send({ command: "sendText", text: command });
        });

        // Триггер: получена команда
        const scenarioStartedTrigger = this.homey.flow.getTriggerCard("scenario_started");
        scenarioStartedTrigger.registerRunListener(async (args, state) => args.scenario.name === state.name);
        scenarioStartedTrigger.registerArgumentAutocompleteListener("scenario", async (query, args) => {
            const scenarios = this.yandex.scenarios.scenarios
                .filter(s => !s.name.startsWith("ХОМЯК")).map(s => ({
                    name: s.name,
                    description: `${this.homey.__("scenario_phrase")}: ${s.trigger}`,
                    image: s.icon
                }));

            return <any>scenarios.filter(result => result.name.toLowerCase().includes(query.toLowerCase()));
        })

        this.yandex.scenarios.on("scenario_started", (data) => {
            const scenario = this.yandex.scenarios.getByAction(data.capabilities[0].state.value);
            if (scenario) scenarioStartedTrigger.trigger(undefined, scenario);
        });
    }
}