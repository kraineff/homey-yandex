import Homey from "homey";
import type { YandexMediaDevice } from "./library/client/home/devices/media.js";
import { Yandex } from "./library/index.js";

export default class YandexApp extends Homey.App {
    yandex!: Yandex;
    #scenarioIcons!: string[];

    async onInit() {
        this.yandex = new Yandex({
            get: async () => JSON.parse(this.homey.settings.get("storage") ?? "{}"),
            set: async content => this.homey.settings.set("storage", JSON.stringify(content))
        });
        setInterval(async () => await this.yandex.api.quasar.getDevices().catch(console.error), 2.16e+7);

        await this.initFlows();
    }

    async onUninit() {
        await this.yandex.home.disconnect();
    }

    async initFlows() {
        const mediaSayAction = this.homey.flow.getActionCard("media_say");
        mediaSayAction.registerRunListener(async args => {
            const speaker: YandexMediaDevice = await args.device.getSpeaker();
            await speaker.say(args.text, args.volume);
        });

        const mediaRunAction = this.homey.flow.getActionCard("media_run");
        mediaRunAction.registerRunListener(async args => {
            const speaker: YandexMediaDevice = await args.device.getSpeaker();
            const response = await speaker.send(args.command, args.volume);
            return { response };
        });

        const scenarioTrigger = this.homey.flow.getTriggerCard("scenario_run");
        scenarioTrigger.registerRunListener(async (args, state) => args.scenario.name === state.trigger);
        scenarioTrigger.registerArgumentAutocompleteListener("scenario", async (query, args) => {
            const scenarios = await this.yandex.home.updater.getScenarios();
            const names = scenarios.map(scenario => scenario.trigger);
            const items = [];

            // Обновление иконки для нового сценария
            if (!query.length && this.#scenarioIcons === undefined) {
                const scenarioIcons = await this.yandex.api.quasar.getScenarioIcons();
                this.#scenarioIcons = scenarioIcons.icons;
            }
            
            // Отображение нового сценария
            if (query.length && !names.includes(query)) {
                const index = Math.floor(Math.random() * this.#scenarioIcons.length);
                const icon = this.#scenarioIcons[index];

                items.push({
                    name: query,
                    description: "Нажмите для создания",
                    image: `https://avatars.mds.yandex.net/get-iot/icons-v2-scenarios-${icon}.svg/svgorig`
                });
            }

            // Отображение сценариев
            scenarios.map(scenario => {
                if (scenario.trigger.toLowerCase().includes(query.toLowerCase())) {
                    items.push({
                        name: scenario.trigger,
                        description: "Нажмите для выбора",
                        image: scenario.icon
                    });
                }
            });

            return items;
        });

        scenarioTrigger.on("update", async () => {
            const flowArgs = await scenarioTrigger.getArgumentValues();
            const promises = flowArgs.map(({ scenario }) => this.createScenario(scenario.name, scenario.image));
            await Promise.all(promises).catch(this.error);
        });

        this.yandex.home.updater.on("scenario_run", async scenario => {
            await scenarioTrigger.trigger(undefined, scenario);
        });
    }

    private async createScenario(trigger: string, iconUrl: string) {
        const icon = iconUrl
            .replace("https://avatars.mds.yandex.net/get-iot/icons-v2-scenarios-", "")
            .replace(".svg/svgorig", "");
        
        const updater = this.yandex.home.updater;
        const scenarios = await updater.getScenarios();
        const scenario = await updater.getScenarioByTrigger(trigger);
        if (scenario) return;

        const scenarioActions = scenarios
            .filter(scenario => scenario.action.value.startsWith("громче на 0!"))
            .map(scenario => scenario.action.value.replace("громче на 0", "").length);

        return await this.yandex.api.quasar.createScenario({
            name: trigger, icon,
            triggers: [{
                trigger: {
                    type: "scenario.trigger.voice",
                    value: trigger
                },
                filters: []
            }],
            steps: [{
                type: "scenarios.steps.actions",
                parameters: {
                    requested_speaker_capabilities: [{
                        retrievable: false,
                        type: "devices.capabilities.quasar.server_action",
                        state: {
                            instance: "text_action",
                            value: `громче на 0${"!".repeat(this.getNextNumber(scenarioActions))}`
                        },
                        parameters: {
                            instance: "text_action"
                        }
                    }],
                    launch_devices: []
                }
            }],
            settings: {
                continue_execution_after_error: false
            }
        });
    }

    private getNextNumber(nums: number[]) {
        const sorted = nums.sort();
        for (let n = 1; n <= sorted.length + 1; n++)
            if (sorted.indexOf(n) === -1) return n;
        return 1;
    };
}