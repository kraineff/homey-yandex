type SpeakerCapability = {
	type: string;
	retrievable: boolean;
	parameters: {
		instance: "text_action" | "phrase_action";
	};
	state: {
		instance: string;
		value: string;
	};
};

export type Scenario = {
	id: string;
	name: string;
	icon: string;
	icon_url: string;
	executable: boolean;
	devices: string[];
	triggers: Array<{
		trigger: {
			type: string;
			value: string;
		};
		type: string;
		value: string;
	}>;
	steps: Array<{
		type: string;
		parameters: {
			items?: Array<{
				id: string;
				type: string;
			}>;
			launch_devices?: Array<{
				id: string;
				capabilities: Array<{
					state: {
						value: unknown;
					};
				}>;
			}>;
			requested_speaker_capabilities?: SpeakerCapability[];
		};
	}>;
	is_active: boolean;
	created: string;
};
