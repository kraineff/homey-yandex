export type YandexSpeakerMessage = {
    experiments: Record<string, string>;
    extra: {
        appState: string;
        environmentState: string;
        watchedVideoState: string;
    };
    id: string;
    sentTime: number;
    state: YandexSpeakerState;
    supported_features: string[];
    unsupported_features: string[];
};

export type YandexSpeakerResponse = YandexSpeakerMessage & {
    processingTime: number;
    requestId: string;
    requestSentTime: number;
    status: "SUCCESS";
}

export type YandexSpeakerVinsResponse = YandexSpeakerResponse & {
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
            directives?: Array<any>;
            suggest: {
                items: Array<{
                    directives: Array<any>;
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

export type YandexSpeakerState = {
    aliceState: "IDLE" | "LISTENING" | "SPEAKING";
    canStop: boolean;
    hdmi: {
        capable: boolean;
        present: boolean;
    };
    controlState: any;
    playerState: {
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
        extra: {
            coverURI: string;
            requestID: string;
            stateType: string;
        } | null;
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
    playing: boolean;
    timeSinceLastVoiceActivity: boolean;
    volume: number;
};