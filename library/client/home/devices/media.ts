import { randomUUID } from "node:crypto";
import EventEmitter from "node:events";
import { isIPv4 } from "node:net";
import type { YandexAPI } from "../../../api";
import type * as Types from "../../../typings";
import { parseJson } from "../../../utils/json";
import { ReconnectSocket } from "../../../utils/websocket";
import type { YandexHomeUpdater } from "../updater";

enum Connection {
    Cloud = 0,
    Local = 1
};

export enum AliceState {
	Idle = "IDLE",
	Listening = "LISTENING",
	Speaking = "SPEAKING",
}

export enum RepeatMode {
    None = 1,
    One = 2,
    All = 3
};

export enum ControlAction {
    Click = "click_action",
    Up = "go_up",
    Down = "go_down",
    Left = "go_left",
    Right = "go_right"
}

export class YandexMediaDevice extends EventEmitter {
    #api: YandexAPI;
    #updater: YandexHomeUpdater;
    #connection: Connection;
    #websocket: ReconnectSocket;
    #conversationToken?: string;

    state: Types.GlagolState = {
        aliceState: AliceState.Idle,
        canStop: false,
        hdmi: {
            capable: false,
            present: false
        },
        playing: false,
        timeSinceLastVoiceActivity: 1000,
        volume: 0.5
    };

    constructor(readonly id: string, api: YandexAPI, updater: YandexHomeUpdater) {
        super();
        this.#api = api;
        this.#updater = updater;
        this.#connection = Connection.Cloud;

        this.#websocket = new ReconnectSocket({
            address: async () => {
                const device = await this.#updater.getDevice(id);
                const quasarInfo = device.quasar_info;
                if (!quasarInfo) throw new Error("Нет информации об устройстве");

                const glagolId = quasarInfo.device_id;
                const glagolDevices = await this.#api.quasar.getAudioDevices();
                const glagolDevice = glagolDevices.find((x) => x.id === this.id);
                
                const networkInfo = glagolDevice?.glagol_info?.network_info;
                if (!networkInfo) throw new Error("Нет информации о сети");

                const address = networkInfo.ip_addresses.find((ip) => isIPv4(ip));
                if (!address) throw new Error("Нет IPv4 адреса");

                this.#conversationToken = await this.#api.quasar.getGlagolToken(glagolId, quasarInfo.platform);
                return `wss://${address}:${networkInfo.external_port}`;
            },
            options: { rejectUnauthorized: false },
            heartbeat: 10,
            message: {
                transform: async (payload) => ({
                    id: randomUUID(),
					sentTime: Date.now(),
					conversationToken: this.#conversationToken,
					payload,
                }),
                encode: async (payload) => JSON.stringify(payload),
				decode: async (message) => parseJson(message.toString()),
                identify: async (payload, message) =>
					message.requestId === payload.id && message.requestSentTime === payload.sentTime,
            }
        });

        this.#websocket.on("connect", async () => {
            await this.#websocket.send({ command: "softwareVersion" });
            this.#connection = Connection.Local;
        });

        this.#websocket.on("message", (message: Types.GlagolMessage) => {
            const currentState = { ...this.state, timeSinceLastVoiceActivity: 0 };
            const messageState = { ...message.state, timeSinceLastVoiceActivity: 0 };

            if (JSON.stringify(currentState) !== JSON.stringify(messageState)) {
                this.state = message.state;
                this.emit("state", this.state);
            }
        });
    }

    async connect() {
        await this.#websocket.connect();
    }

    async disconnect() {
        await this.#websocket.disconnect();
        this.removeAllListeners();
    }

    async #commandQuasar(instance: string, value: unknown) {
        await this.#api.quasar.runDeviceAction(this.id, [{
            type: "devices.capabilities.quasar.server_action",
            state: { instance, value }
        }]);
        return "";
    }

    async #commandGlagol(command: string, args: Record<string, unknown> = {}) {
        return await this.#websocket
            .send({ command, ...args })
            .then((response: Types.GlagolResponse) => {
                if (!("vinsResponse" in response)) return "";
                const vins = response.vinsResponse;
                const voiceText = vins.voice_response?.output_speech?.text;
                const cardText = vins.response?.cards?.find((card) => card.type === "simple_text")?.text;
                return voiceText || cardText || "";
            });
    }

    async #command(quasar?: [string, string?], glagol?: [string, Record<string, unknown>?], volume?: number) {
        const currentState = this.state;
        let response = "";

        if (volume !== undefined) {
            await this.pause();
            await this.volumeSet(volume);
        }

        if ((this.#connection === Connection.Cloud && quasar) ||
            (this.#connection === Connection.Local && quasar && !glagol)) {
            const instance = quasar.length > 1 ? "phrase_action" : "text_action";
            response = await this.#commandQuasar(instance, quasar[0]);

            if (this.#connection === Connection.Local) {
                await new Promise<void>((resolve) => {
                    const listener = (state: Types.GlagolState) => {
                        if (state.aliceState !== AliceState.Idle) return;
                        this.removeListener("state", listener);
                        resolve();
                    };
                    
                    this.addListener("state", listener);
                    setTimeout(() => listener(this.state), 2_000);
                });
            }
        }

        if (this.#connection === Connection.Local && glagol) {
            response = await this.#commandGlagol(glagol[0], glagol[1]);
        }

        if (volume !== undefined) {
            await this.volumeSet(currentState.volume);
			if (currentState.playing) await this.play();
        }

        return response;
    }

    async say(text: string, volume?: number) {
        await this.#command([text, "tts"], undefined, volume);
    }

    async send(text: string, volume?: number) {
        await this.#command([text], ["sendText", { text }], volume);
    }

    async play() {
        if (this.#connection === Connection.Local &&
            this.state.playing === true) return;

        if (this.#connection === Connection.Cloud) {
            this.state.playing = true;
            this.emit("state", this.state);
        }

        await this.#command(["играй"], ["play"]);
    }

    async pause() {
        if (this.#connection === Connection.Local &&
            this.state.playing === false) return;

        if (this.#connection === Connection.Cloud) {
            this.state.playing = false;
            this.emit("state", this.state);
        }

        await this.#command(["стоп"], ["stop"]);
    }

    async rewind(position: number) {
        if (this.#connection === Connection.Local &&
            this.state.playerState?.progress === position) return;

        await this.#command(undefined, ["rewind", { position }]);
    }

    async next() {
        if (this.#connection === Connection.Cloud) {
            this.state.playing = true;
            this.emit("state", this.state);
        }

        await this.#command(["следующий"], ["next"]);
    }

    async prev() {
        if (this.#connection === Connection.Cloud) {
            this.state.playing = true;
            this.emit("state", this.state);
        }

        await this.#command(["предыдущий"], ["prev"]);
    }

    async shuffle(enable: boolean) {
        if (this.#connection === Connection.Local &&
            this.state.playerState?.entityInfo.shuffled === enable) return;

        await this.#command(["перемешай"], ["shuffle", { enable }], 0);
    }

    async repeat(mode: RepeatMode) {
        if (this.#connection === Connection.Local &&
            this.state.playerState?.entityInfo.repeatMode === RepeatMode[mode]) return;

        if (this.#connection === Connection.Cloud && mode === RepeatMode.None)
            return await this.next();

        await this.#command(["на повтор"], ["repeat", { mode }], 0);
    }

    async volumeSet(value: number) {
        const volume = Math.min(Math.max(value, 0), 1);

        if (this.#connection === Connection.Local &&
            this.state.volume === volume) return;

        if (this.#connection === Connection.Cloud) {
            this.state.volume = volume;
            this.emit("state", this.state);
        }

        await this.#command([`громкость ${volume * 10}`], ["setVolume", { volume }]);
    }

    async control(action: ControlAction) {
        const actions: Record<ControlAction, string> = {
            click_action: "нажми",
            go_up: "вверх",
            go_down: "вниз",
            go_left: "влево",
            go_right: "вправо"
        };

        await this.#command([actions[action]], ["control", { action }]);
    }

    async home() {
        await this.#command(["домой"]);
    }

    async back() {
        await this.#command(["назад"]);
    }

    async power(state: boolean) {
        await this.#command([`${state ? "включи" : "выключи"} телевизор`], undefined, 0);
    }
}