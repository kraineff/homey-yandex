import Yandex from "../../yandex";
import { Scenario } from "./types";

const missingNumbers = (a: number[], l: boolean = true) => Array.from(Array(Math.max(...a)).keys())
    .map((n, i) => a.indexOf(i) < 0  && (!l || i > Math.min(...a)) ? i : null)
    .filter(f => f);

export default class YandexScenarios {
    private yandex: Yandex;
    private scenarios: Scenario[];

    getById(id: string) {
        return this.scenarios.find(scenario => scenario.id === id);
    }

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this.scenarios = [];
    }

    async update() {
        if (this.yandex.options?.debug)
            console.log("[Сценарии] -> Обновление сценариев");

        const ids = await this.yandex.session.get("https://iot.quasar.yandex.ru/m/user/scenarios")
            .then(resp => [...resp.data.scenarios].map(scenario => scenario.id));

        this.scenarios = await Promise.all(ids.map(async id => {
            return this.yandex.session.get(`https://iot.quasar.yandex.ru/m/user/scenarios/${id}/edit`)
                .then(resp => resp.data.scenario);
        }));

        // await this.convertScenarios();
    }
    
    async edit(scenario: Scenario) {
        if (this.yandex.options?.debug)
            console.log(`[Сценарии] -> Изменение сценария -> ${scenario.id}`);

        return this.yandex.session.put(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenario.id}`, { data: scenario });
    }
    
    async run(id: any) {
        if (this.yandex.options?.debug)
            console.log(`[Сценарии] -> Запуск сценария -> ${id}`);

        return this.yandex.session.post(`https://iot.quasar.yandex.ru/m/user/scenarios/${id}/actions`);
    }

    // private async convertScenarios() {
    //     const convert = this.getActionsByValue("тихо");
    //     if (convert.length) {
    //         const converted = this.getActionsByValue("Сделай громче на 0?")
    //             .map(item => item.action.state.value.replace("Сделай громче на 0", "").length).sort();
            
    //         let start: number, missing: any;
    //         if (converted.length > 0) {
    //             missing = missingNumbers(converted);
    //             start = converted[converted.length - 1];
    //         } else start = 0;

    //         convert.forEach(async item => {
    //             item.action.state.instance = "text_action";
    //             item.action.state.value = "Сделай громче на 0" + "?".repeat(missing && missing.length > 0 ? missing.shift() : start += 1);
    //             await this.edit(this.getById(item.id)!);
    //         });
    //     }
    // }
}