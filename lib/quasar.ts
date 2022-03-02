import YandexSession from "./session";
import YandexDevices from "./devices";
import YandexScenarios from "./scenarios";
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

        let scenarioId = this.scenarios.findByEncodedId(speaker.id)?.id || await this.scenarios.add(speaker.id);
        let scenario = this.scenarios.findById(scenarioId)!;
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        await this.scenarios.edit(scenario);
        await this.scenarios.run(scenario);
    }
}