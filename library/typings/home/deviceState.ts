import type { CapabilityV3, PropertyV3 } from "./device";

export type DeviceStateQuery = {
	id: string;
	state: "online";
	status_info: {
		status: "online";
		updated: number;
		changed: number;
	};
	capabilities: CapabilityV3[];
	properties: PropertyV3[];
};

export type DeviceStateAction = {
	id: string;
	state: "online";
	status_info: Record<string, never>;
	capabilities: CapabilityV3[];
};

export type DeviceStateCallback = {
	id: string;
	state: "online";
	status_info: {
		status: "online";
		reportable: boolean;
		updated: number;
		changed: number;
	};
	capabilities: CapabilityV3[];
	properties: Array<
		PropertyV3 & {
			state_changed_at: string;
		}
	>;
};
