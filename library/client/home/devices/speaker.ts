import EventEmitter from "events";
import { YandexAPI } from "../../../api/index.js";
import { YandexHomeUpdater } from "../updater.js";
import { YandexSpeakerState, YandexSpeakerVinsResponse } from "../typings.js";
import { ReconnectSocket } from "../../../utils/websocket.js";
import { randomUUID } from "crypto";
import { strictJsonParse } from "../../../utils/json.js";

enum AliceState {
    Idle = "IDLE",
    Speaking = "SPEAKING"
};

enum Connection {
    Local = 0,
    Cloud = 1,
    CloudOnly = 2
};

type CommandParams = {
    cloud?: [string, string?];
    local?: [string, Object?];
    volume?: number;
};

export class YandexSpeaker extends EventEmitter {
    state: Partial<YandexSpeakerState>;
    connection: Connection;

    private websocket: ReconnectSocket;
    private token?: string;

    constructor(readonly id: string, private api: YandexAPI, private updater: YandexHomeUpdater) {
        super();
        this.state = { volume: 0.5, playing: false };
        this.connection = Connection.Cloud;

        this.websocket = new ReconnectSocket({
            address: async () => {
                const device = await this.updater.getDevice(id);
                const deviceInfo = device.quasar_info;

                const speakerId = deviceInfo.device_id;
                const speakers = await this.api.quasar.getAudioDevices() as Array<any>;
                const speaker = speakers.find(s => s.id === this.id);

                if (!speaker.glagol_info.network_info) {
                    this.connection = Connection.Cloud;
                    throw new Error("Нет локального управления");
                }

                const speakerAddress = speaker.glagol_info.network_info.ip_addresses.find((ip: string) => ip.includes("."));
                const speakerPort = speaker.glagol_info.network_info.external_port;
                this.token = await this.api.quasar.getGlagolToken(speakerId, deviceInfo.platform);
                return `wss://${speakerAddress}:${speakerPort}`;
            },
            options: { rejectUnauthorized: false },
            heartbeat: 10,
            message: {
                transform: async payload => ({
                    id: randomUUID(), sentTime: Date.now(),
                    conversationToken: this.token,
                    payload
                }),
                encode: async payload => JSON.stringify(payload),
                decode: async message => strictJsonParse(message.toString()),
                identify: async (payload, message) =>
                    message.requestId === payload.id &&
                    message.requestSentTime === payload.sentTime
            }
        });

        this.websocket.on("connect", async () => {
            await this.websocket.send({ command: "softwareVersion" });
            this.connection = Connection.Local;
        });

        this.websocket.on("disconnect", async () => {
            this.connection = Connection.Cloud;
        });

        this.websocket.on("message", message => {
            const state = message.state;
            if (JSON.stringify(this.state) === JSON.stringify(state)) return;
            this.state = state;
            this.emit("state", this.state);
        });
    }

    async connect() {
        await this.websocket.connect();
    }

    async disconnect() {
        await this.websocket.disconnect();
    }

    async destroy() {
        await this.disconnect();
        this.removeAllListeners();
    }

    private async command(params: Omit<CommandParams, "volume">) {
        const cloudAction = async () => {
            if (!params.cloud) return;
            await this.api.quasar.runDeviceAction(this.id, [{
                type: "devices.capabilities.quasar.server_action",
                state: {
                    instance: params.cloud[1] ?? "text_action",
                    value: params.cloud[0]
                }
            }]);
            return "";
        };
        
        if (!params.local || this.connection === Connection.CloudOnly)
            return await cloudAction();

        return await this.websocket.send({ command: params.local[0], ...(params.local[1] || {}) })
            .then(res => {
                if (!res.vinsResponse) return;
                const vinsResponse = res.vinsResponse as YandexSpeakerVinsResponse["vinsResponse"];
                const speechResponse = vinsResponse.voice_response?.output_speech?.text;
                const cardsResponse = vinsResponse.response?.cards?.find(card => card.type === "simple_text");
                return speechResponse || cardsResponse && cardsResponse.text;
            })
            .catch(cloudAction);
    }

    private async commandWithVolume(params: CommandParams) {
        return new Promise<any>(async (resolve, reject) => {
            try {
                let response: any;
                const { volume, ...command } = params;
                const currentVolume = this.state.volume!;
                const currentPlaying = this.state.playing!;
                const bringBack = async () => {
                    await this.volumeSet(currentVolume);
                    if (currentPlaying) await this.mediaPlay();
                    resolve(response);
                };

                await this.mediaPause();
                await this.volumeSet(volume!);
                response = await this.command(command);

                // В облачном режиме все команды идут по очереди, поэтому сразу возвращаем
                if (this.connection !== Connection.Local)
                    return await bringBack();

                // В локальном режиме ждем, когда Алиса договорит
                let aliceState: string;
                const handleState = async (state: YandexSpeakerState) => {
                    if ((aliceState === AliceState.Speaking && state.aliceState !== aliceState) ||
                        (aliceState === AliceState.Idle && state.aliceState === AliceState.Idle)) {
                            this.off("state", handleState);
                            await bringBack();
                        }
                    aliceState = state.aliceState;
                };
                this.on("state", handleState);
            } catch (e) { reject(e) }
        });
    }

    async actionSay(message: string, volume?: number) {
        volume = volume ?? this.state.volume;

        await this.commandWithVolume({
            cloud: [message, "phrase_action"],
            volume
        });
    }
    
    async actionRun(command: string, volume?: number) {
        volume = volume ?? this.state.volume;

        return await this.commandWithVolume({
            cloud: [command],
            local: ["sendText", { text: command }],
            volume
        });
    }

    async controlClick() {
        await this.command({
            cloud: ["нажми"],
            local: ["control", { action: "click_action" }]
        });
    }

    async controlUp() {
        await this.command({
            cloud: ["вверх"],
            local: ["control", { action: "go_up" }]
        });
    }

    async controlDown() {
        await this.command({
            cloud: ["вниз"],
            local: ["control", { action: "go_down" }]
        });
    }

    async controlLeft() {
        await this.command({
            cloud: ["влево"],
            local: ["control", { action: "go_left" }]
        });
    }

    async controlRight() {
        await this.command({
            cloud: ["вправо"],
            local: ["control", { action: "go_right" }]
        });
    }

    async controlHome() {
        await this.command({
            cloud: ["домой"]
        });
    }

    async controlBack() {
        await this.command({
            cloud: ["назад"]
        });
    }

    async controlPower(enable: boolean) {
        await this.commandWithVolume({
            cloud: [(enable && "включи" || "выключи") + "телевизор"],
            volume: 0
        });
    }
    
    async mediaPlay() {
        if (this.state.playing) return;

        await this.command({
            cloud: ["играй"],
            local: ["play"]
        });

        // Облачный фоллбэк
        this.state.playing = true;
        this.emit("state", this.state);
    }

    async mediaPause() {
        if (!this.state.playing) return;

        await this.command({
            cloud: ["стоп"],
            local: ["stop"]
        });

        // Облачный фоллбэк
        this.state.playing = false;
        this.emit("state", this.state);
    }

    async mediaRewind(position: number) {
        await this.command({
            local: ["rewind", { position }]
        });
    }

    async mediaNext() {
        await this.command({
            cloud: ["следующий"],
            local: ["next"]
        });

        // Облачный фоллбэк
        this.state.playing = true;
        this.emit("state", this.state);
    }

    async mediaPrev() {
        await this.command({
            cloud: ["предыдущий"],
            local: ["prev"]
        });
        
        // Облачный фоллбэк
        this.state.playing = true;
        this.emit("state", this.state);
    }

    async musicShuffle(enable: boolean) {
        if (this.state.playerState?.entityInfo.shuffled === enable) return;

        await this.commandWithVolume({
            cloud: ["перемешай"],
            local: ["shuffle", { enable }],
            volume: 0
        });

        // Облачный фоллбэк
        this.state.playerState = this.state.playerState || {} as any;
        this.state.playerState!.entityInfo = this.state.playerState!.entityInfo || {};
        this.state.playerState!.entityInfo!.shuffled = enable;
        this.emit("state", this.state);
    }

    async musicRepeat(repeatMode: "none" | "one" | "all") {
        const modes = { "none": 1, "one": 2, "all": 3 };
        const mode = modes[repeatMode];

        // В облачном режиме переключаемся на следующий трек,
        // если режим повтора 'none'
        if (this.connection !== Connection.Local && mode === 1)
            return await this.mediaNext();

        await this.commandWithVolume({
            cloud: ["на повтор"],
            local: ["repeat", { mode }],
            volume: 0
        });
    }

    async volumeSet(volume: number) {
        volume = Math.min(Math.max(volume, 0), 1);
        if (volume === this.state.volume) return;
        
        await this.command({
            cloud: [`громкость ${volume * 10}`],
            local: ["setVolume", { volume }]
        });
        
        // Облачный фоллбэк
        this.state.volume = volume;
        this.emit("state", this.state);
    }

    async volumeUp(step: number = 0.1) {
        const volume = this.state.volume! + step;
        await this.volumeSet(volume);
    }

    async volumeDown(step: number = 0.1) {
        const volume = this.state.volume! - step;
        await this.volumeSet(volume);
    }
}