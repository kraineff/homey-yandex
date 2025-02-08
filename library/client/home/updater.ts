import EventEmitter from "node:events";
import type { YandexAPI } from "../../api/index.js";
import type * as Types from "../../typings";
import { parseJson } from "../../utils/json.js";
import { ReconnectSocket } from "../../utils/websocket.js";

type UpdateScenarios = {
	operation: "update_scenario_list";
	source: "create_scenario_launch" | "update_scenario_launch";
	scenarios: Types.Scenario[];
	scheduled_scenarios: any[];
};

type UpdateDevices = {
	operation: "update_device_list";
	households: Types.HouseholdV3[];
};

type UpdateDevicesStates = {
	operation: "update_states";
	update_groups: null;
	update_multidevices: null;
} & (
	| {
			source: "query";
			updated_devices: Types.DeviceStateQuery[];
	  }
	| {
			source: "action";
			updated_devices: Types.DeviceStateAction[];
	  }
	| {
			source: "callback";
			updated_devices: Types.DeviceStateCallback[];
	  }
);

type UpdateMessage = UpdateScenarios | UpdateDevices | UpdateDevicesStates;

export class YandexHomeUpdater extends EventEmitter {
	#websocket: ReconnectSocket;
	#devices: Record<string, Types.DeviceV3> = {};
	#scenarios: any[] = [];

	constructor(private api: YandexAPI) {
		super();
		this.#websocket = new ReconnectSocket({
			address: async () => {
				const response = await this.api.quasar.getDevices();
				this.#updateDevices(response.households);
				return response.updates_url;
			},
			heartbeat: 70,
			message: {
				decode: async (message) => {
					const json = parseJson<Record<string, any>>(message.toString());
					const data = parseJson<Record<string, any>>(json.message as string);
					return { operation: json.operation as string, ...data };
				},
			},
		});

		this.#websocket.on("message", async (message: UpdateMessage) => {
			switch (message.operation) {
				case "update_scenario_list":
					return await this.#handleScenarios(message);
				case "update_device_list":
					return await this.#handleDevices(message);
				case "update_states":
					return await this.#handleStates(message);
			}
		});
	}

	async disconnect() {
		await this.#websocket.disconnect();
		this.removeAllListeners();
	}

	async #handleScenarios(message: UpdateScenarios) {
		this.#updateScenarios(message.scenarios);
		this.emit("scenarios", message);
	}

	async #handleDevices(message: UpdateDevices) {
		this.#updateDevices(message.households);
		this.emit("devices", this.#devices);
	}

	async #handleStates(message: UpdateDevicesStates) {
		this.emit("states", message);

		if (message.source === "action") {
			await Promise.all(
				message.updated_devices.map(async (device) => {
					await Promise.all(
						device.capabilities.map(async (capability) => {
							if (capability.type !== "devices.capabilities.quasar.server_action") return;
							const scenario = await this.getScenarioByAction(
								capability.state.value as string,
							).catch(console.error);
							scenario && this.emit("scenario_run", scenario);
						}),
					);
				}),
			);
		}
	}

	async getDevices() {
		await this.#websocket.connect();
		return this.#devices;
	}

	async getDevice(id: string) {
		const devices = await this.getDevices();
		return devices[id];
	}

	async getDevicesByType(type: string) {
		const devices = await this.getDevices();
		return Object.values(devices).filter((device) => device.type === type);
	}

	async getDevicesByPlatform(platform: string) {
		const devices = await this.getDevices();
		return Object.values(devices).filter((device) => device.quasar_info?.platform === platform);
	}

	async getScenarios() {
		await this.#websocket.connect();

		if (!this.#scenarios.length) {
			const scenarios = await this.api.quasar.getScenarios();
			await this.#updateScenarios(scenarios);
		}

		return this.#scenarios;
	}

	async getScenarioByTrigger(trigger: string) {
		const scenarios = await this.getScenarios();
		return scenarios.find((scenario) => scenario.trigger === trigger);
	}

	async getScenarioByAction(action: string) {
		const scenarios = await this.getScenarios();
		return scenarios.find((scenario) => scenario.action.value === action);
	}

	#updateDevices(households: Types.HouseholdV3[]) {
		households.map((household) => {
			const devices = household.all;
			devices.map((device) => {
				this.#devices[device.id] = device;
			});
		});
	}

	async #updateScenarios(scenarios: Types.Scenario[]) {
		if (!scenarios.length) return;

		const scenarioIds = scenarios.map((scenario) => scenario.id);
		const scenarioDetails = await Promise.all(
			scenarioIds.map(async (scenarioId) => {
				const address = `https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}/edit`;
				const response = await this.api.request(address);
				return response.data.scenario;
			}),
		);

		this.#scenarios = scenarioDetails
			.map((scenario) => ({
				name: scenario.name,
				trigger: scenario.triggers[0]?.value,
				action: {
					type:
						scenario.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.instance ||
						scenario.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.instance,
					value:
						scenario.steps[0]?.parameters?.launch_devices[0]?.capabilities[0]?.state?.value ||
						scenario.steps[0]?.parameters?.requested_speaker_capabilities[0]?.state?.value,
				},
				icon: scenario.icon_url,
				device_id: scenario.steps[0]?.parameters?.launch_devices[0]?.id,
				id: scenario.id,
			}))
			.filter((scenario) => ["text_action", "phrase_action"].includes(scenario.action.type));
	}
}
