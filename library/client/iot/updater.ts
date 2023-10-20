import { YandexAPI } from '../../api';
import { strictJsonParse } from '../../utils/json';
import Socket from '../../utils/socket';
import EventEmitter from 'events';

export class YandexIotUpdater {
    readonly events: EventEmitter;
    #socket: Socket;
    #devices: {
        [id: string]: any;
    };
    #scenarios: any[];

    constructor(private api: YandexAPI) {
        this.events = new EventEmitter();
        this.#devices = {};
        this.#scenarios = [];

        this.#socket = new Socket({
            address: async () => {
                const response = await this.api.iot.getDevices();
                this.#updateDevices(response.households);
                return response.updates_url;
            },
            heartbeat: 70,
            message: {
                decode: message => {
                    const json = strictJsonParse(message.toString());
                    const data = strictJsonParse(json.message);
                    return { operation: json.operation, ...data };
                }
            },
            listeners: {
                message: async message => {
                    switch (message.operation) {
                        case 'update_device_list': return await this.#handleDevices(message);
                        case 'update_scenario_list': return await this.#handleScenarios(message);
                        case 'update_states': return await this.#handleStates(message);
                    }
                }
            }
        });
    }

    async init() {
        await this.#updateScenarios([]);
        await this.#socket.open();
    }

    getDevices() {
        return this.#devices;
    }

    getDevice(id: string) {
        return this.#devices[id];
    }

    getDevicesByType(type: string) {
        const devices = this.getDevices();
        return Object.values(devices)
            .filter(device => device.type === type);
    }

    getDevicesByPlatform(platform: string) {
        const devices = this.getDevices();
        return Object.values(devices)
            .filter(device => device.quasar_info?.platform === platform);
    }

    getScenarios() {
        return this.#scenarios;
    }

    getScenarioByTrigger(trigger: string) {
        const scenarios = this.getScenarios();
        return scenarios.find(scenario => scenario.trigger === trigger);
    }

    getScenarioByAction(action: string) {
        const scenarios = this.getScenarios();
        return scenarios.find(scenario => scenario.action.value === action);
    }

    #updateDevices(households: any[]) {
        this.#devices = households.reduce<any>((result, household) => {
            const devices = household.all;
            devices.map((device: any) => result[device.id] = device);
            return result;
        }, {});
    }

    async #updateScenarios(scenarios: any[]) {
        if (scenarios.length === 0)
            scenarios = await this.api.iot.getScenarios();

        const scenarioIds = scenarios.map(scenario => scenario.id);
        const scenarioPromises = scenarioIds.map(scenarioId => {
            return this.api.request(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}/edit`)
                .then(res => res.data.scenario);
        });
        scenarios = await Promise.all(scenarioPromises);
        
        this.#scenarios = scenarios
            .map(scenario => ({
                name: scenario.name,
                trigger: scenario.triggers[0]?.value,
                action: {
                    type: scenario.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.instance ||
                        scenario.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.instance,
                    value: scenario.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.value ||
                        scenario.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.value
                },
                icon: scenario.icon_url,
                device_id: scenario.steps[0]?.parameters?.launch_devices[0]?.id,
                id: scenario.id
            }))
            .filter(scenario => ['text_action', 'phrase_action'].includes(scenario.action.type));
    }
    
    // source: 'discovery' | 'delete_device' | 'update_device' | 'update_room'
    async #handleDevices(data: any) {
        this.#updateDevices(data.households);
        this.events.emit('devices', this.#devices);
    }
    
    // source: 'create_scenario' | 'delete_scenario' | 'create_scenario_launch' | 'update_scenario_launch'
    async #handleScenarios(data: any) {
        await this.#updateScenarios(data.scenarios);
        this.events.emit('scenarios', data);
    }
    
    // source: 'query' | 'action' | 'callback'
    async #handleStates(data: any) {
        const devices = data.updated_devices as any[];
        this.events.emit('states', data);

        // Триггер сценария
        devices.map(device => {
            if (!device.hasOwnProperty('capabilities') ||
                device.capabilities.length !== 1) return;

            const capability = device.capabilities[0];
            if (!capability.hasOwnProperty('state') ||
                capability.type !== 'devices.capabilities.quasar.server_action') return;

            const scenario = this.getScenarioByAction(capability.state.value);
            scenario && this.events.emit('scenario_run', scenario);
        });
    }
}