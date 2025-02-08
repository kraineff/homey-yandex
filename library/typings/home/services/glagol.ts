import type { QuasarConfig } from "./quasar";

export type GlagolDevice = {
	activation_code: string;
	activation_region: string;
	config: QuasarConfig;
	glagol: {
		security: {
			server_certificate: string;
			server_private_key: string;
		};
	};
	id: string;
	name: string;
	networkInfo?: {
		external_port: number;
		ip_addresses: string[];
		mac_addresses: string[];
		ts: number;
		wifi_ssid?: string;
	};
	platform: string;
	promocode_activated: boolean;
	tags: string[];
};

export type GlagolAudioInfo = {
	id: string;
	name: string;
	aliases: string[];
	type: string;
	external_id: string;
	skill_id: string;
	household_id: string;
	room: string;
	groups: any[];
	capabilities: any[];
	properties: any[];
	quasar_info: {
		device_id: string;
		platform: string;
		device_color: string;
	};
	voiceprint: {
		status: string;
		method: string;
	};
	glagol_info: {
		server_certificate: string;
		network_info: {
			ts: number;
			ip_addresses: string[];
			mac_addresses: string[];
			external_port: number;
			wifi_ssid: string;
		};
	};
};

export type GlagolMessage = {
	id: string;
	sentTime: number;
	state: GlagolState;
	extra: {
		appState: string;
		environmentState: string;
		watchedVideoState: string;
	};
	experiments: Record<string, string>;
	supported_features: string[];
	unsupported_features: string[];
};

export type GlagolState = {
	aliceState: string;
	canStop: boolean;
	hdmi: {
		capable: boolean;
		present: boolean;
	};
	controlState?: any;
	playerState?: GlagolPlayerState;
	playing: boolean;
	timeSinceLastVoiceActivity: number;
	volume: number;
};

export type GlagolPlayerState = {
	duration: number;
	entityInfo: {
		description: string;
		id: string;
		next?: any;
		prev?: any;
		repeatMode?: string;
		shuffled?: boolean;
		type: string;
	};
	extra: Record<string, never> | {
		coverURI: string;
		requestID: string;
		stateType: string;
	};
	hasNext: boolean;
	hasPause: boolean;
	hasPlay: boolean;
	hasPrev: boolean;
	hasProgressBar: boolean;
	id: string;
	liveStreamText: string;
	playerType: string;
	playlistDescription: string;
	playlistId: string;
	playlistPuid: string;
	playlistType: string;
	progress: number;
	showPlayer: boolean;
	subtitle: string;
	title: string;
	type: string;
};

export type GlagolResponse = GlagolCommandResponse | GlagolVinsResponse;

export type GlagolCommandResponse = GlagolMessage & {
	requestId: string;
	requestSentTime: number;
	processingTime: number;
	status: "SUCCESS";
};

export type GlagolVinsResponse = GlagolCommandResponse & {
	errorCode: string;
	errorText: string;
	errorTextLang: string;
	vinsResponse: {
		header: {
			dialog_id: string;
			request_id: string;
			response_id: string;
			sequence_number: number;
		};
		response: {
			is_streaming?: boolean;
			cards?: Array<{
				card_id: string;
				text: string;
				type: string;
			}>;
			directives?: any[];
			suggest: {
				items: Array<{
					directives: any[];
					title: string;
					type: string;
				}>;
			};
		};
		voice_response: {
			has_voice_response: boolean;
			output_speech: {
				text: string;
			};
			should_listen: boolean;
		};
	};
};
