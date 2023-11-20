import { YandexAPI } from '../../api';
import { strictJsonParse } from '../../utils/json';
import EventEmitter from 'events';
import ReconnectSocket from '../../utils/websocket';

export class YandexIotUpdater {
    readonly events: EventEmitter;
    #websocket: ReconnectSocket;
    #connectionPromise?: Promise<void>;
    #devices: {
        [id: string]: any;
    };
    #scenarios: any[];

    constructor(private api: YandexAPI) {
        this.#devices = {};
        this.#scenarios = [];

        this.events = new EventEmitter();
        this.events.on('newListener',
            async () => await this.#connect().catch(console.error));

        this.#websocket = new ReconnectSocket({
            address: async () => {
                const response = await this.api.iot.getDevices();
                this.#updateDevices(response.households);
                return response.updates_url;
            },
            heartbeat: 70,
            message: {
                decode: async message => {
                    const json = strictJsonParse(message.toString());
                    const data = strictJsonParse(json.message);
                    return { operation: json.operation, ...data };
                }
            }
        });

        this.#websocket.on('message', async message => {
            switch (message.operation) {
                case 'update_device_list': return await this.#handleDevices(message);
                case 'update_scenario_list': return await this.#handleScenarios(message);
                case 'update_states': return await this.#handleStates(message);
            }
        });
    }

    async destroy() {
        await this.#websocket.disconnect();
    }

    async #connect() {
        if (!this.#connectionPromise) this.#connectionPromise = this.#websocket.connect();
        await Promise.resolve(this.#connectionPromise).catch(error => {
            this.#connectionPromise = undefined;
            throw error;
        });
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
        const promises = devices.map(async device => {
            if (!device.hasOwnProperty('capabilities') ||
                device.capabilities.length !== 1) return;

            const capability = device.capabilities[0];
            if (!capability.hasOwnProperty('state') ||
                capability.type !== 'devices.capabilities.quasar.server_action') return;

            const scenario = await this.getScenarioByAction(capability.state.value).catch(console.log);
            scenario && this.events.emit('scenario_run', scenario);
        });
        await Promise.all(promises);
    }

    async getDevices() {
        await this.#connect();
        return this.#devices;
    }

    async getDevice(id: string) {
        const devices = await this.getDevices();
        return devices[id];
    }

    async getDevicesByType(type: string) {
        const devices = await this.getDevices();
        return Object.values(devices)
            .filter(device => device.type === type);
    }

    async getDevicesByPlatform(platform: string) {
        const devices = await this.getDevices();
        return Object.values(devices)
            .filter(device => device.quasar_info?.platform === platform);
    }

    async getScenarios() {
        if (!this.#scenarios.length) {
            const scenarios = await this.api.iot.getScenarios();
            await this.#updateScenarios(scenarios);
        }
        return this.#scenarios;
    }

    async getScenarioByTrigger(trigger: string) {
        const scenarios = await this.getScenarios();
        return scenarios.find(scenario => scenario.trigger === trigger);
    }

    async getScenarioByAction(action: string) {
        const scenarios = await this.getScenarios();
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
        if (!scenarios.length) return;

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
}