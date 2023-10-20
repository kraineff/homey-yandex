export type YandexIotSpeakerState = {
    aliceState: 'IDLE' | 'LISTENING' | 'SPEAKING';
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