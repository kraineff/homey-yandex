import EventEmitter from "events";
import { client, connection } from "websocket";
import YandexSession from "./session";
import { Scenario } from "./types";

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
            "requested_speaker_capabilities": [],
            "launch_devices": [{
                "id": data.device_id,
                "capabilities": [{
                    "type": "devices.capabilities.quasar.server_action",
                    "state": {
                        "instance": data.action.type,
                        "value": data.action.value
                    }
                }]
            }]
        }
    }]
});

export default class YandexScenarios extends EventEmitter {
    session: YandexSession;

    scenarios!: Scenario[];

    scenarioTimer?: NodeJS.Timeout;
    connection?: connection;
    reconnectTimer?: NodeJS.Timeout;

    constructor(session: YandexSession) {
        super();
        this.session = session;
    }

    async init() {
        await this.update();
        await this.connect();
    }

    findById = (scenarioId: string) => this.scenarios.find(s => s.id === scenarioId);
    findByEncodedId = (deviceId: string) => this.scenarios.find(s => s.name === encode(deviceId));
    findByAction = (action: string) => this.scenarios.find(s => s.action.value === action);

    async add(deviceId: string): Promise<string> {
        console.log(`[Сценарии: ${deviceId}] -> Добавление сценария`);

        let name = encode(deviceId);

        let response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/scenarios`,
            data: SCENARIO_BASE({
                name: name,
                trigger: name.slice(6),
                device_id: deviceId,
                action: {
                    type: "phrase_action",
                    value: "пустышка"
                }
            })
        });

        if (response?.status !== "ok") throw `Ошибка: ${response}`;
        return response.scenario_id;
    }

    async edit(scenario: Scenario) {
        console.log(`[Сценарии: ${scenario.device_id}] -> Изменение сценария`);

        let response = await this.session.request({
            method: "PUT",
            url: `${USER_URL}/scenarios/${scenario.id}`,
            data: SCENARIO_BASE(scenario)
        });

        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }

    async run(scenario: Scenario) {
        console.log(`[Сценарии: ${scenario.device_id}] -> Запуск сценария -> ${scenario.action.value}`);

        let response = await this.session.request({
            method: "POST",
            url: `${USER_URL}/scenarios/${scenario.id}/actions`
        });

        if (response?.status !== "ok") throw `Ошибка: ${response}`;
    }

    async update(scenarios: any[] = []) {
        console.log(`[Сценарии] -> Обновление сценариев`);

        // Получение сценариев
        if (scenarios.length === 0) {
            let response = await this.session.request({
                method: "GET",
                url: `${USER_URL}/scenarios`
            });
            if (response?.status !== "ok") throw `Ошибка: ${response}`;
            scenarios = response.scenarios;
        }
        
        // Получение полных сценариев
        let ids = scenarios.map(s => s.id);

        let rawScenarios = await Promise.all(ids.map(async (id) => {
            let response = await this.session.request({
                method: "GET",
                url: `${USER_URL}/scenarios/${id}/edit`
            });
            return response?.status === "ok" ? response.scenario: {};
        }));

        this.scenarios = rawScenarios.map(s => ({
            name: s.name,
            trigger: s.triggers[0]?.value,
            action: {
                type: s.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.instance,
                value: s.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.value
            },
            icon: s.icon_url,
            device_id: s.steps[0]?.parameters?.launch_devices[0]?.id,
            id: s.id
        }));

        // Конвертация действий
        let convert = this.scenarios.filter(s => s.action.value.toLowerCase() === "тихо");
        if (convert.length > 0) {
            let converted = this.scenarios
                .filter(s => s.action.value.includes("Сделай громче на 0?"))
                .map(s => s.action.value.replace("Сделай громче на 0", "").length).sort();

            let start: number, missing: any;
            if (converted.length > 0) {
                missing = missingNumbers(converted);
                start = converted[converted.length - 1];
            }
            else start = 0;
            
            convert.forEach(async s => {
                s.action.type = "text_action";
                s.action.value = "Сделай громче на 0" + "?".repeat(missing && missing.length > 0 ? missing.shift() : start = start + 1);
                await this.edit(s);
            });
        }
    }

    async connect() {
        console.log(`[Сценарии] -> Запуск получения команд`);

        // Получение ссылки
        let response = await this.session.request({
            method: "GET",
            url: "https://iot.quasar.yandex.ru/m/v3/user/devices"
        });
        if (response?.status !== "ok") throw `Ошибка: ${response}`;

        // Подключение
        if (this.connection?.connected) this.connection.close();
        const ws = new client();

        ws.on("connect", (connection: connection) => {
            this.connection = connection;
            
            this.connection.on("message", async (message) => {
                if (message.type === "utf8") {
                    let response = JSON.parse(message.utf8Data);

                    if (response.operation === "update_scenario_list") {
                        if (this.scenarioTimer) clearTimeout(this.scenarioTimer);
                        this.scenarioTimer = setTimeout(async () => {
                            await this.update(JSON.parse(response.message).scenarios);
                        }, 5000);
                    }
                    
                    if (response.operation === "update_states") {
                        (<any[]>JSON.parse(response.message).updated_devices)
                            .filter(d => {
                                if (!d.hasOwnProperty("capabilities")) return false;
                                return (<any[]>d.capabilities).every(c => {
                                    if (!c.hasOwnProperty("state")) return false;
                                    if (c.type !== "devices.capabilities.quasar.server_action") return false;
                                    return true;
                                })
                            })
                            .forEach(d => this.emit("scenario_started", d));
                    }
                }
            });

            this.connection.on("error", async () => await this.reConnect());
        });

        ws.on("connectFailed", async () => await this.reConnect());

        ws.connect(response.updates_url);
    }

    async reConnect() {
        console.log(`[Quasar] -> Перезапуск получения команд`);

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(async () => {
            await this.connect();
        }, 10000);
    }

    async close() {
        // this.ready = false;
        if (this.connection?.connected) {
            console.log(`[Quasar] -> Остановка получения команд`);
            this.connection.close();
        }
    }
}