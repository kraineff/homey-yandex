import Homey from 'homey';
import { Yandex } from './library';
import { YandexIotSpeaker, YandexIotUpdater } from './library/client/iot';

module.exports = class YandexApp extends Homey.App {
    yandex!: Yandex;
    #scenarioIcons!: string[];
    #scenarioIcon!: string;
    #scenarioEvent!: boolean;

    async onInit() {
        this.yandex = new Yandex({
            get: async () => JSON.parse(this.homey.settings.get('storage') ?? '{}'),
            set: async content => this.homey.settings.set('storage', JSON.stringify(content))
        });

        // Flow-действие > Произнести текст
        const mediaSayAction = this.homey.flow.getActionCard('media_say');
        mediaSayAction.registerRunListener(async args => {
            const speaker: YandexIotSpeaker = await args.device.getSpeaker();
            await speaker.actionSay(args.text, args.volume);
        });

        // Flow-действие > Выполнить команду
        const mediaRunAction = this.homey.flow.getActionCard('media_run');
        mediaRunAction.registerRunListener(async args => {
            const speaker: YandexIotSpeaker = await args.device.getSpeaker();
            await speaker.actionRun(args.command, args.volume);
        });

        // Flow-триггер > Сценарий запущен
        const scenarioTrigger = this.homey.flow.getTriggerCard('scenario_run');
        scenarioTrigger.registerRunListener(async (args, state) => args.scenario.name === state.trigger);
        scenarioTrigger.registerArgumentAutocompleteListener('scenario', async (query, args) => {
            const updater = await this.yandex.iot.getUpdater();
            const scenarios = updater.getScenarios();
            const names = scenarios.map(scenario => scenario.trigger);
            const items = [];

            // Ивент триггера
            if (!this.#scenarioEvent) {
                this.#scenarioEvent = true;
                updater.events.on('scenario_run', async scenario => {
                    await scenarioTrigger.trigger(undefined, scenario);
                });
            }

            // Обновление иконки для нового сценария
            if (query === '') {
                this.#scenarioIcon = await this.#getScenarioIcon();
            }
            
            // Отображение нового сценария
            if (query !== '' && !names.includes(query)) {
                items.push({
                    name: query,
                    description: 'Нажмите для создания',
                    image: `https://avatars.mds.yandex.net/get-iot/icons-scenarios-${this.#scenarioIcon}.svg/svgorig`
                });
            }

            // Отображение сценариев
            scenarios.map(scenario => {
                if (scenario.trigger.toLowerCase().includes(query.toLowerCase())) {
                    items.push({
                        name: scenario.trigger,
                        description: 'Нажмите для выбора',
                        image: scenario.icon
                    });
                }
            });

            return items;
        });
        
        scenarioTrigger.on('update', async () => {
            const flowArgs = await scenarioTrigger.getArgumentValues();
            const promises = flowArgs.map(({ scenario }) => this.#createScenario(scenario.name, scenario.image));
            await Promise.all(promises).catch(this.error);
        });

        // Обновление куки
        setInterval(async () => await this.yandex.request('https://ya.ru').catch(this.error), 2.16e+7);
    }
    
    async #getScenarioIcon() {
        if (this.#scenarioIcons === undefined) {
            const scenarioIcons = await this.yandex.api.iot.getScenarioIcons();
            this.#scenarioIcons = scenarioIcons.icons;
        }

        const index = Math.floor(Math.random() * this.#scenarioIcons.length);
        return this.#scenarioIcons[index];
    }

    async #createScenario(trigger: string, iconUrl: string) {
        const icon = iconUrl
            .replace('https://avatars.mds.yandex.net/get-iot/icons-scenarios-', '')
            .replace('.svg/svgorig', '');
        
        const updater = await this.yandex.iot.getUpdater();
        const scenarios = updater.getScenarios();
        const scenario = updater.getScenarioByTrigger(trigger);
        if (scenario) return;

        const scenarioActions = scenarios
            .filter(scenario => scenario.action.value.startsWith('громче на 0!'))
            .map(scenario => scenario.action.value.replace('громче на 0', '').length);

        return await this.yandex.api.iot.createScenario({
            name: trigger, icon,
            triggers: [{
                trigger: {
                    type: 'scenario.trigger.voice',
                    value: trigger
                },
                filters: []
            }],
            steps: [{
                type: 'scenarios.steps.actions',
                parameters: {
                    requested_speaker_capabilities: [{
                        retrievable: false,
                        type: 'devices.capabilities.quasar.server_action',
                        state: {
                            instance: 'text_action',
                            value: 'громче на 0' + '!'.repeat(this.#getNextNumber(scenarioActions))
                        },
                        parameters: {
                            instance: 'text_action'
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

    #getNextNumber(nums: number[]) {
        nums = nums.sort();
    
        for (let n = 1; n <= nums.length + 1; n++) {
            if (nums.indexOf(n) === -1) 
                return n;
        }
        return 1;
    };
}