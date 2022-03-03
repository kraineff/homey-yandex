import YandexSession from "./session";
import YandexDevices from "./quasar/devices";
import YandexScenarios from "./quasar/scenarios";
import { Speaker } from "./types";

export default class YandexQuasar {
    session: YandexSession;
    devices: YandexDevices;
    scenarios: YandexScenarios;

    ready: boolean = false;

    constructor(session: YandexSession) {
        this.session = session;
        this.devices = new YandexDevices(this.session);
        this.scenarios = new YandexScenarios(this.session);
    }

    async init() {
        console.log("[Quasar] -> Инициализация квазара");
        
        this.ready = true;
        await this.devices.init();
        await this.scenarios.init();
    }

    async close() {
        this.ready = false;
        await this.scenarios.close();
    }

    async send(speaker: Speaker, message: string, isTTS: boolean = false) {
        console.log(`[Quasar: ${speaker.id}] -> Выполнение команды -> ${message}`);

        const scenarioId = this.scenarios.getByEncodedId(speaker.id)?.id || await this.scenarios.add(speaker.id);
        const oldScenario = this.scenarios.get(scenarioId)!;
        
        let scenario = JSON.parse(JSON.stringify(oldScenario));
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        if (JSON.stringify(oldScenario) !== JSON.stringify(scenario)) await this.scenarios.edit(scenario);
        await this.scenarios.run(scenario);
    }
}