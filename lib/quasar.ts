import YandexSession from "./session";
import YandexDevices from "./devices";
import YandexScenarios from "./scenarios";
import { Device } from "./types";

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

    async send(device: Device, message: string, isTTS: boolean = false) {
        if (!device.quasar.scenario_id) return;
        let scenario = this.scenarios.findById(device.quasar.scenario_id);
        if (!scenario) return;

        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;
        await this.scenarios.edit(scenario);
        await this.scenarios.run(scenario);
    }
}