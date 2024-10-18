import EventEmitter from "events";
import { YandexAPI } from "../../api/index.mjs";
import { ReconnectSocket } from "../../utils/websocket.js";
import { strictJsonParse } from "../../utils/json.js";

export class YandexHomeUpdater extends EventEmitter {
    private websocket: ReconnectSocket;
    private devices: Record<string, any>;
    private scenarios: Array<any>;

    constructor(private api: YandexAPI) {
        super();
        this.devices = {};
        this.scenarios = [];

        this.websocket = new ReconnectSocket({
            address: async () => {
                const response = await this.api.iot.getDevices();
                this.updateDevices(response.households);
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

        this.websocket.on("message", async message => {
            switch (message.operation) {
                case "update_device_list": return await this.handleDevices(message);
                case "update_scenario_list": return await this.handleScenarios(message);
                case "update_states": return await this.handleStates(message);
            }
        });
    }

    async connect() {
        await this.websocket.connect();
    }

    async disconnect() {
        await this.websocket.disconnect();
    }

    async getDevices() {
        return this.devices;
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
        if (!this.scenarios.length) {
            const scenarios = await this.api.iot.getScenarios();
            await this.updateScenarios(scenarios);
        }
        return this.scenarios;
    }

    async getScenarioByTrigger(trigger: string) {
        const scenarios = await this.getScenarios();
        return scenarios.find(scenario => scenario.trigger === trigger);
    }

    async getScenarioByAction(action: string) {
        const scenarios = await this.getScenarios();
        return scenarios.find(scenario => scenario.action.value === action);
    }

    private async handleDevices(data: any) {
        this.updateDevices(data.households);
        this.emit("devices", this.devices);
    }
    
    private async handleScenarios(data: any) {
        this.updateScenarios(data.scenarios);
        this.emit("scenarios", data);
    }

    private async handleStates(data: any) {
        this.emit("states", data);
        
        // Триггер сценария
        const devices = data.updated_devices as any[];
        const devicesPromises = devices.map(async device => {
            if (!device.hasOwnProperty("capabilities") ||
                device.capabilities.length !== 1) return;

            const capability = device.capabilities[0];
            if (!capability.hasOwnProperty("state") ||
                capability.type !== "devices.capabilities.quasar.server_action") return;

            const scenario = await this.getScenarioByAction(capability.state.value).catch(console.error);
            scenario && this.emit("scenario_run", scenario);
        });
        await Promise.all(devicesPromises);
    }

    private updateDevices(households: any[]) {
        this.devices = households.reduce<any>((result, household) => {
            const devices = household.all;
            devices.map((device: any) => result[device.id] = device);
            return result;
        }, {});
    }

    private async updateScenarios(scenarios: any[]) {
        if (!scenarios.length) return;

        const scenarioIds = scenarios.map(scenario => scenario.id);
        const scenarioPromises = scenarioIds.map(async scenarioId => {
            const res = await this.api.request(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}/edit`);
            return res.data.scenario;
        });
        scenarios = await Promise.all(scenarioPromises);
        
        this.scenarios = scenarios
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
            .filter(scenario => ["text_action", "phrase_action"].includes(scenario.action.type));
    }
}