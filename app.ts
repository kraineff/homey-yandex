import Homey from "homey";

import Yandex from "./lib/yandex";

module.exports = class YandexAlice extends Homey.App {
    yandex!: Yandex;
    discoveryStrategy = this.homey.discovery.getStrategy("yandex_station");

    async onInit() {
        this.yandex = new Yandex();
        
        this.yandex.on("update", data => {
            Object.keys(data).forEach(key => {
                console.log(`[Приложение] -> Сохранение ${key}`);
                this.homey.settings.set(key, data[key])
            });
        });
        
        this.yandex.on("close", () => {
            ["x_token", "cookies", "music_token"].forEach(key => {
                console.log(`[Приложение] -> Удаление ${key}`);
                this.homey.settings.set(key, "");
            });
        });

        await this.yandex.login(
            this.homey.settings.get("x_token"),
            this.homey.settings.get("cookies"),
            this.homey.settings.get("music_token")
        );

        // Действия: ТТС и команда
        this.homey.flow.getActionCard("say_tts").registerRunListener(async (args, state) => await args.device.device.say(args.mode, args.text, +args.volume));
        this.homey.flow.getActionCard("send_command").registerRunListener(async (args, state) => {
            const speaker = args.device.device;
            await speaker.run(speaker.local ? { command: "sendText", text: args.command } : args.command);
        });

        // Триггер: получена команда
        const scenarioStartedTrigger = this.homey.flow.getTriggerCard("scenario_started");
        scenarioStartedTrigger.registerRunListener(async (args, state) => args.scenario.name === state.name);
        scenarioStartedTrigger.registerArgumentAutocompleteListener("scenario", async (query, args) => {
            const scenarios = this.yandex.scenarios.get()
                .filter(s => !s.name.startsWith("ХОМЯК")).map(s => ({
                    name: s.name,
                    description: `${this.homey.__("scenario_phrase")}: ${s.trigger}`,
                    image: s.icon
                }));

            return <any>scenarios.filter(result => result.name.toLowerCase().includes(query.toLowerCase()));
        })

        this.yandex.on("scenario_state", async (state) => {
            const scenario = this.yandex.scenarios.getByActionValue(state.capabilities[0].state?.value);
            if (scenario) await scenarioStartedTrigger.trigger(undefined, scenario);
        });
    }
}