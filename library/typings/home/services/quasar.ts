export type QuasarInfo = {
	device_id: string;
	platform: string;
	color: string;
	multiroom_available: boolean;
	multistep_scenarios_available: boolean;
	device_discovery_methods: string[];
	device_setup_methods: string[];
};

export type QuasarConfig = {
	allow_non_self_calls?: boolean;
	audio_player?: {
		music_quality: string;
	};
	beta?: boolean;
	dndMode: {
		enabled: boolean;
		ends?: string;
		features: {
			allowIncomingCalls: boolean;
		};
		platformSettings?: {
			showClock?: boolean;
			showIdle?: boolean;
		};
		starts?: string;
	};
	equalizer?: {
		active_preset_id: string;
		bands: Array<{
			freq: number;
			gain: number;
			width: number;
		}>;
		custom_preset_bands: [number, number, number, number, number];
		enabled: boolean;
		smartEnabled: boolean;
	};
	hdmiAudio?: boolean;
	led?: {
		brightness?: {
			auto: boolean;
			value: number;
		};
		idle_animation?: boolean;
		music_equalizer_visualization?: {
			auto: boolean;
			style: string;
		};
		time_visualization?: {
			format: string;
			size?: string;
		};
	};
	locale: string;
	location?: {
		latitude: number;
		longitude: number;
	};
	location_mark?: string;
	name: string;
	phone_number_bindings?: any;
	radio_nanny_enabled?: boolean;
	screenSaverConfig?: {
		type: string;
	};
	tv_beta?: boolean;
	tv_max?: boolean;
	voice_activation?: {
		enabled: boolean;
	};
};

export type QuasarAccountConfig = {
	aliceAdaptiveVolume: {
		enabled: boolean;
	};
	aliceProactivity: boolean;
	alwaysOnMicForShortcuts: boolean;
	audio_player: {
		crossfadeEnabled: boolean;
	};
	childContentAccess: "children" | "safe";
	contentAccess: "without" | "medium" | "children" | "safe";
	doNotUseUserLogs: boolean;
	enableChildVad: boolean;
	enabledCommandSpotters: {
		call: {
			answer: boolean;
		};
		music: {
			bluetooth: boolean;
			feedback: boolean;
			navigation: boolean;
			playAndPause: boolean;
			volume: boolean;
		};
		smartHome: {
			light: boolean;
			tv: boolean;
		};
		tv: {
			backToHome: boolean;
			navigation: boolean;
		};
	};
	jingle: boolean;
	saveHistoryUsage: boolean;
	smartActivation: boolean;
	spotter: "alisa" | "yandex";
	useBiometryChildScoring: boolean;
	user_wifi_config: {
		wifi_hash: string;
	};
	users: any[];
};

export type QuasarDeviceConfig = {
	id: string;
	name: string;
	names: string[];
	groups: any[];
	child_device_ids: string[];
	child_multidevice_ids: string[];
	skill_id: string;
	device_info: {
		manufacturer: string;
		model: string;
	};
	favorite: boolean;
	external_name: string;
	external_id: string;
	original_type: string;
	device_type: {
		original_type: string;
		current_type: string;
		switchable: boolean;
		role_switchable: boolean;
	};
	fw_upgradable: boolean;
	settings: {
		status_notifications: {
			offline: {
				available: boolean;
				enabled: boolean;
				delay: number;
			};
		};
	};
	quasar_info: QuasarInfo;
	quasar_features: {
		device_discovery_methods: string[];
		device_setup_methods: string[];
	};
	quasar_config: QuasarConfig;
	quasar_config_version: string;
	quasar_tags: string[];
	tandem: {
		candidates: any[];
	};
	voiceprint: {
		status: string;
		method: string;
	};
	phone_linking_state: {
		status: string;
		device_id: string;
	};
	subscription: {
		enabled: boolean;
		active: boolean;
		completed: boolean;
	};
	room: {
		id: string;
		name: string;
	};
	household: {
		id: string;
		name: string;
	};
	related_scenario_ids: string[];
	scenario_templates: any[];
};
