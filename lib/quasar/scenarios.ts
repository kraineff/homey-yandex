import { Device, Scenario } from "../types";
import Yandex from "../yandex";

const USER_URL: string = "https://iot.quasar.yandex.ru/m/user";

const missingNumbers = (a: number[], l: boolean = true) => Array.from(Array(Math.max(...a)).keys())
    .map((n, i) => a.indexOf(i) < 0  && (!l || i > Math.min(...a)) ? i : null)
    .filter(f => f);

const encode = (deviceId: string): string => {
    const MASK_EN = "0123456789abcdef-";
    const MASK_RU = "оеаинтсрвлкмдпуяю";
    return "ХОМЯК " + [...deviceId].map(char => MASK_RU[MASK_EN.indexOf(char)]).join("");
}

const SCENARIO_BASE = (data: any) => ({
    "name": data.name,
    "icon": "home",
    "triggers": [{
        "type": "scenario.trigger.voice",
        "value": data.trigger
    }],
    "steps": [{
        "type": "scenarios.steps.actions",
        "parameters": {
            "requested_speaker_capabilities": !data.device_id ? [{
                "type": "devices.capabilities.quasar.server_action",
                "state": {
                    "instance": data.action.type,
                    "value": data.action.value
                }
            }] : [],
            "launch_devices": data.device_id ? [{
                "id": data.device_id,
                "capabilities": [{
                    "type": "devices.capabilities.quasar.server_action",
                    "state": {
                        "instance": data.action.type,
                        "value": data.action.value
                    }
                }]
            }] : []
        }
    }]
});

export default class YandexScenarios {
    yandex: Yandex;

    rawScenarios?: any[];
    scenarios!: Scenario[];

    constructor(yandex: Yandex) {
        this.yandex = yandex;
    }

    async init() {
        await this.update();
    }

    get = (scenarioId: string) => this.scenarios.find(s => s.id === scenarioId);
    getByAction = (action: string) => this.scenarios.find(s => s.action.value === action);
    getByEncodedId = (deviceId: string) => this.scenarios.find(s => s.name === encode(deviceId));

    updateData(scenario: Scenario) {
        const found = this.scenarios.findIndex(s => s.id === scenario.id);
        found !== -1 ? this.scenarios[found] = scenario : this.scenarios.push(scenario);
    }

    async send(speaker: Device, message: string, isTTS: boolean = false) {
        console.log(`[Quasar: ${speaker.id}] -> Выполнение команды -> ${message}`);

        const scenarioId = this.getByEncodedId(speaker.id)?.id || await this.add(speaker.id);
        const oldScenario = this.get(scenarioId)!;
        
        let scenario = JSON.parse(JSON.stringify(oldScenario));
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        await this.edit(scenario);
        await this.run(scenario);
    }

    async add(deviceId: string) {
        console.log(`[Сценарии] -> Добавление системного сценария -> ${deviceId}`);

        const name = encode(deviceId);
        let data = {
            name: name,
            trigger: name.slice(6),
            device_id: deviceId,
            action: {
                type: "phrase_action",
                value: "пустышка"
            }
        }

        return this.yandex.post(`${USER_URL}/scenarios`, { data: SCENARIO_BASE(data) }).then(resp => {
            this.updateData(<Scenario>{ ...data, id: resp.data.scenario_id });
            return resp.data.scenario_id;
        });
    }

    async edit(scenario: Scenario) {
        console.log(`[Сценарии] -> Изменение сценария -> ${scenario.name}`);

        return this.yandex.put(`${USER_URL}/scenarios/${scenario.id}`, { data: SCENARIO_BASE(scenario) }).then(resp => this.updateData(scenario));
    }

    async run(scenario: Scenario) {
        console.log(`[Сценарии] -> Запуск сценария -> ${scenario.name}`);

        return this.yandex.post(`${USER_URL}/scenarios/${scenario.id}/actions`);
    }

    async getRaw() {
        return this.yandex.get(`${USER_URL}/scenarios`).then(resp => <any[]>resp.data.scenarios);
    }

    async update(scenarios: any[] = []) {
        console.log(`[Сценарии] -> Обновление сценариев`);

        if (scenarios.length === 0) await this.getRaw().then(s => scenarios = s);

        const ids = scenarios.map(s => s.id);
        let rawScenarios = await Promise.all(ids.map(id => {
            return this.yandex.get(`${USER_URL}/scenarios/${id}/edit`).then(resp => resp.data.scenario);
        }));

        this.scenarios = rawScenarios.map(s => ({
            name: s.name,
            trigger: s.triggers[0]?.value,
            action: {
                type: s.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.instance ||
                    s.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.instance,
                value: s.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.value ||
                    s.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.value
            },
            icon: s.icon_url,
            device_id: s.steps[0]?.parameters?.launch_devices[0]?.id,
            id: s.id
        })).filter(s => ["text_action", "phrase_action"].includes(s.action.type));

        // Конвертация действий
        const convert = this.scenarios.filter(s => s.action.value.toLowerCase() === "тихо");
        if (convert.length > 0) {
            const converted = this.scenarios
                .filter(s => s.action.value.includes("Сделай громче на 0?"))
                .map(s => s.action.value.replace("Сделай громче на 0", "").length).sort();

            let start: number, missing: any;
            if (converted.length > 0) {
                missing = missingNumbers(converted);
                start = converted[converted.length - 1];
            } else start = 0;

            convert.forEach(async s => {
                s.action.type = "text_action";
                s.action.value = "Сделай громче на 0" + "?".repeat(missing && missing.length > 0 ? missing.shift() : start += 1);
                await this.edit(s);
            });
        }
    }
}