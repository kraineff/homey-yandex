import type { DeviceV3 } from "./device";

export * from "./services/glagol";
export * from "./services/quasar";
export * from "./device";
export * from "./deviceState";
export * from "./scenario";

export type HouseholdV3 = {
	id: string;
	name: string;
	type: string;
	location: {
		address: string;
		short_address: string;
	};
	is_current: boolean;
	aliases: string[];
	rooms: RoomV3[];
	all: DeviceV3[];
	all_background_image: {
		id: string;
	};
};

export type RoomV3 = {
	id: string;
	name: string;
	items: DeviceV3[];
	background_image: {
		id: string;
	};
};
