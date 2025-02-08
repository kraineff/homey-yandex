import type { QuasarInfo } from "./services/quasar";

export type DeviceV3 = {
	id: string;
	name: string;
	type: string;
	icon_url: string;
	capabilities: CapabilityV3[];
	properties: PropertyV3[];
	item_type: string;
	skill_id: string;
	quasar_info?: QuasarInfo;
	room_name: string;
	status_info: {
		status: string;
		reportable?: boolean;
		updated?: number;
		changed?: number;
	};
	state: string;
	created: string;
	parameters: {
		device_info: {
			manufacturer?: string;
			model?: string;
			hw_version?: string;
			sw_version?: string;
		};
	};
};

export type CapabilityV3 = {
	type: string;
	retrievable: boolean;
	reportable: boolean;
	parameters: Record<string, unknown>;
	state: {
		instance: string;
		value: unknown;
	};
	can_be_deferred: boolean;
};

export type PropertyV3 = {
	type: string;
	retrievable: boolean;
	reportable: boolean;
	parameters: {
		instance: string;
		name: string;
		unit: string;
	};
	state: {
		percent: number | null;
		status: string | null;
		value: number;
	};
	last_updated: string;
};
