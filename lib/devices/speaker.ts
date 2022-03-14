import Yandex from "../yandex";
import { RawDevice } from "../modules/devices";
import EventEmitter from "events";
import WebSocket from 'ws';
import ReconnectingWebSocket from "reconnecting-websocket";
import Queue from "promise-queue";
import { diff } from "deep-object-diff";
import { v4 } from "uuid";

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

export default class YandexSpeaker extends EventEmitter {
    yandex: Yandex;
    queue: Queue;
    raw: RawDevice;
    
    rws?: ReconnectingWebSocket;
    localToken?: string;
    isLocal: boolean;

    settings!: SpeakerConfig;
    lastState: any;
    savedVolumeLevel?: number;
    waitForIdle: boolean;

    constructor(yandex: Yandex, id: string) {
        super();
        this.yandex = yandex;
        this.raw = this.yandex.devices.speakers.find(s => s.id === id)!;
        this.yandex.speakers_.push(this);

        this.queue = new Queue(1);
        this.isLocal = false;
        this.lastState = {};
        this.waitForIdle = false;
    }

    async init(url?: () => string) {
        console.log(`[Колонка: ${this.raw.id}] -> Инициализация`);

        this.settings = await this.getSettings();
        
        if (url !== undefined) {
            this.isLocal = true;
            if (!this.localToken) await this.updateToken();
            await this.connect(url);
        }
    }

    async close() {
        console.log(`[Колонка: ${this.raw.id}] -> Остановка получения данных`);

        if (this.rws) this.rws.close();
        this.removeAllListeners("update");
    }

    async run(command: any) {
        console.log(`[Колонка: ${this.raw.id}] -> Выполнение действия -> ${typeof command === "object" ? JSON.stringify(command) : command}`);

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
            if (mode === "cloud") await this.run(`громкость на ${volume}`);
            else {
                this.savedVolumeLevel = this.lastState.volume;
                this.waitForIdle = true;
                await this.run({ command: "setVolume", volume: volume / 10 });
            }
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

    play = () => this.run(this.isLocal ? { command: "play" } : "продолжить");
    pause = () => this.run(this.isLocal ? { command: "stop" } : "пауза");
    next = () => this.run(this.isLocal ? { command: "next" } : "следующий трек");
    prev = () => this.run(this.isLocal ? { command: "prev" } : "предыдущий трек");

    volumeSet = (volume: number) => this.run(this.isLocal ? { command: "setVolume", volume: volume / 10 } : `громкость на ${volume}`);

    volumeUp = async (volume: number) => {
        const _volume = (volume + 1) / 10;
        if (!this.isLocal) return this.run("громче")
        else if (_volume <= 1) return this.run({ command: "setVolume", volume: _volume });
    }

    volumeDown = async (volume: number) => {
        const _volume = (volume - 1) / 10;
        if (!this.isLocal) return this.run("громче")
        else if (_volume >= 0) return this.run({ command: "setVolume", volume: _volume });
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

    async _command(message: string, isTTS: boolean = false) {
        const scenarioId = this.yandex.scenarios.getByEncodedId(this.raw.id)?.id || await this.yandex.scenarios.add(this.raw.id);
        const oldScenario = this.yandex.scenarios.get(scenarioId)!;
        
        let scenario = JSON.parse(JSON.stringify(oldScenario));
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        this.queue.add(async () => {
            await this.yandex.scenarios.edit(scenario);
            await this.yandex.scenarios.run(scenario);
        });
    }

    async connect(url: () => string) {
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

                if (this.lastState.aliceState === "LISTENING" && this.waitForIdle) {
                    if (this.savedVolumeLevel !== undefined) await this.run({ command: "setVolume", volume: this.savedVolumeLevel });
                    this.waitForIdle = false;
                }

                const difference: any = diff(this.lastState, state);
                if (!Object.keys(difference).length) return;
                this.lastState = state;
                this.emit("update", difference);
            }
        });
        //@ts-ignore
        this.rws.addEventListener("close", async event => {
            if (event.code === 4000) await this.updateToken();
        });
    }

    async updateToken() {
        console.log(`[Колонка: ${this.raw.id}] -> Обновление локального токена`);

        return this.yandex.get("https://quasar.yandex.net/glagol/token", {
            params: {
                device_id: this.raw.quasar_info!.device_id,
                platform: this.raw.quasar_info!.platform
            }
        }).then(resp => this.localToken = resp.data.token);
    }
}