import Yandex from "../yandex";
import WebSocket from 'ws';
import ReconnectingWebSocket from "reconnecting-websocket";
import Queue from "promise-queue";
import { diff } from "deep-object-diff";
import { v4 } from "uuid";
import BaseDevice from "./base";

type SpeakerConfig = {
    allow_non_self_calls: boolean
    beta: boolean
    led?: {
        brightness: { auto: boolean, value: number }
        music_equalizer_visualization: { auto: boolean, style: string }
        time_visualization: { size: string }
    }
    location: any
    name: string
}

class SpeakerWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            perMessageDeflate: false,
            rejectUnauthorized: false
        });
    }
}

export default class YandexSpeaker extends BaseDevice {
    volume: number
    settings!: SpeakerConfig;
    
    private local: boolean;
    private lastState: any;
    private savedVolumeLevel?: number;

    private queue: Queue;
    private rws?: ReconnectingWebSocket;
    private localToken?: string;

    constructor(yandex: Yandex) {
        super(yandex);
        this.volume = 0;
        this.local = false;
        this.lastState = {};
        this.queue = new Queue(1);

        this.on("newListener", (eventName, listener) => {
            if (eventName === "state") listener(Object.keys(this.lastState).length ? this.lastState : this.raw);
        });
        this.on("unavailable", () => {
            if (this.rws) this.rws.close();
        });
    }

    async init(url?: () => string) {
        console.log(`[Колонка: ${this.raw.id}] -> Инициализация колонки`);

        this.settings = await this.getSettings();
        
        if (url !== undefined) {
            this.local = true;
            if (!this.localToken) await this.updateToken();
            await this.connect(url);
        }

        this.emit("available");
        this.initialized = true;
    }

    async run(command: any) {
        if (typeof command === "object") {
            this.rws!.send(JSON.stringify({
                conversationToken: this.localToken,
                payload: command,
                id: v4(),
                sentTime: Date.now()
            }));
        } else await this._command(command);
    }

    async say(mode: "cloud" | "local", message: string, volume: number = -1) {
        console.log(`[Колонка: ${this.raw.id}] -> Синтез речи -> ${message}`);

        if (volume !== -1) {
            if (mode === "local") this.savedVolumeLevel = Number(this.volume);
            await this.volumeSet(volume, mode);
        } 
        
        if (mode === "local") {
            await this.run({
                command: "serverAction",
                serverActionEventPayload: {
                    type: "server_action",
                    name: "update_form",
                    payload: {
                        form_update: {
                            name: "personal_assistant.scenarios.repeat_after_me",
                            slots: [{ type: "string", name: "request", value: message }]
                        },
                        resubmit: true
                    }
                }
            });
        } else await this._command(message, true);
    }
    
    async play() {
        console.log(`[Колонка: ${this.raw.id}] -> Продолжение музыки`);
        return this.run(this.local ? { command: "play" } : "продолжить");
    }

    async pause() {
        console.log(`[Колонка: ${this.raw.id}] -> Остановка музыки`);
        return this.run(this.local ? { command: "stop" } : "пауза");
    }

    async next() {
        console.log(`[Колонка: ${this.raw.id}] -> Следующий трек`);
        return this.run(this.local ? { command: "next" } : "следующий трек");
    }

    async prev() {        
        console.log(`[Колонка: ${this.raw.id}] -> Предыдущий трек`);
        return this.run(this.local ? { command: "prev" } : "предыдущий трек");
    }

    async volumeSet(volume: number, mode: "auto" | "cloud" | "local" = "auto") {
        console.log(`[Колонка: ${this.raw.id}] -> Установка громкости -> ${volume}`);

        this.volume = volume;
        await this.run((mode === "auto" ? this.local : mode === "local") ? { command: "setVolume", volume: volume / 10 } : `громкость на ${volume}`);
        return this.volume;
    }

    async volumeUp(value: number = 1) {
        console.log(`[Колонка: ${this.raw.id}] -> Повышение громкости`);

        const newVolume = this.volume + value;
        if (newVolume <= 10) {
            await this.run(this.local ? { command: "setVolume", volume: newVolume / 10 } : `громкость на ${newVolume}`);
            return newVolume;
        }
        return this.volume;
    }

    async volumeDown(value: number = 1) {
        console.log(`[Колонка: ${this.raw.id}] -> Понижение громкости`);

        const newVolume = this.volume + value;
        if (newVolume >= 0) {
            await this.run(this.local ? { command: "setVolume", volume: newVolume / 10 } : `громкость на ${newVolume}`);
            return newVolume;
        }
        return this.volume;
    }

    async getSettings() {
        console.log(`[Колонка: ${this.raw.id}] -> Получение настроек`);

        return this.yandex.get("https://quasar.yandex.ru/get_device_config", {
            params: { "device_id": this.raw.quasar_info!.device_id, "platform": this.raw.quasar_info!.platform }
        }).then(resp => <SpeakerConfig>resp.data.config);
    }

    async setSettings(config: SpeakerConfig) {
        console.log(`[Колонка: ${this.raw.id}] -> Установка настроек`);

        return this.yandex.post("https://quasar.yandex.ru/set_device_config", {
            params: { "device_id": this.raw.quasar_info!.device_id, "platform": this.raw.quasar_info!.platform },
            data: config
        });
    }

    private async _command(message: string, isTTS: boolean = false) {
        const scenarioId = this.yandex.scenarios.getByEncodedId(this.raw.id)?.id || await this.yandex.scenarios.add(this.raw.id);
        const oldScenario = this.yandex.scenarios.getById(scenarioId)!;
        
        let scenario = JSON.parse(JSON.stringify(oldScenario));
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        this.queue.add(async () => {
            await this.yandex.scenarios.edit(scenario);
            await this.yandex.scenarios.run(scenario);
        });
    }

    private async connect(url: () => string) {
        console.log(`[Колонка: ${this.raw.id}] -> Запуск получения данных`);

        this.rws = new ReconnectingWebSocket(url, [], { WebSocket: SpeakerWebSocket });
        //@ts-ignore
        this.rws.addEventListener("open", async () => await this.run({ command: "softwareVersion" }));
        //@ts-ignore
        this.rws.addEventListener("message", async event => {
            const data = JSON.parse(event.data);
            if (data?.state) {
                const { state } = data;
                delete state.timeSinceLastVoiceActivity;
                delete state.playerState.duration;
                delete state.playerState.progress;

                if (this.lastState.aliceState === "LISTENING" && this.savedVolumeLevel) {
                    await this.volumeSet(this.savedVolumeLevel, "local")
                    this.savedVolumeLevel = undefined;
                }

                const difference: any = diff(this.lastState, state);
                if (!Object.keys(difference).length) return;
                this.lastState = state;
                if (difference.volume !== undefined) this.volume = difference.volume * 10;
                this.emit("state", difference);
            }
        });
        //@ts-ignore
        this.rws.addEventListener("close", async event => {
            if (event.code === 4000) await this.updateToken();
        });
    }

    private async updateToken() {
        console.log(`[Колонка: ${this.raw.id}] -> Обновление локального токена`);

        return this.yandex.get("https://quasar.yandex.net/glagol/token", {
            params: {
                device_id: this.raw.quasar_info!.device_id,
                platform: this.raw.quasar_info!.platform
            }
        }).then(resp => this.localToken = resp.data.token);
    }
}