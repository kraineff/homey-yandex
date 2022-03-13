import Yandex from "../yandex";
import YandexScenarios from "../quasar/scenarios";
import { Device } from "../types";

import EventEmitter from "events";
import WebSocket from 'ws';
import ReconnectingWebSocket from "reconnecting-websocket";
import { v4 } from "uuid";
import { diff } from "deep-object-diff";

type SpeakerConfigType = {
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
            rejectUnauthorized: false
        });
    }
}

export default class Speaker extends EventEmitter {
    yandex: Yandex;
    scenarios: YandexScenarios;
    speaker: Device;

    settings!: SpeakerConfigType;

    rws?: ReconnectingWebSocket;
    localToken?: string;
    isLocal: boolean = false;
    
    lastState: any = {};
    waitForIdle: boolean = false;
    savedVolumeLevel?: number;

    constructor(yandex: Yandex, speaker: Device) {
        super();
        this.yandex = yandex;
        this.scenarios = yandex.scenarios;
        this.speaker = speaker;
    }

    async init(url?: () => string) {
        console.log(`[Колонка: ${this.speaker.id}] -> Инициализация`);

        this.settings = await this.getSettings();
        
        if (url !== undefined) {
            this.isLocal = true;
            if (!this.localToken) await this.updateToken();
            await this.connect(url);
        }
    }

    async close() {
        console.log(`[Колонка: ${this.speaker.id}] -> Остановка получения данных`);

        if (this.rws) this.rws.close();
    }

    async run(command: any) {
        console.log(`[Колонка: ${this.speaker.id}] -> Выполнение действия -> ${typeof command === "object" ? JSON.stringify(command) : command}`);

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
        console.log(`[Колонка: ${this.speaker.id}] -> Синтез речи -> ${message}`);
        
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
                            slots: [{type: "string", name: "request", value: message}]
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
        console.log(`[Колонка: ${this.speaker.id}] -> Получение настроек`);

        return this.yandex.get("https://quasar.yandex.ru/get_device_config", {
            params: { "device_id": this.speaker.quasar_info!.device_id, "platform": this.speaker.quasar_info!.platform }
        }).then(resp => <SpeakerConfigType>resp.data.config);
    }

    async setSettings(config: SpeakerConfigType) {
        console.log(`[Колонка: ${this.speaker.id}] -> Установка настроек`);

        return this.yandex.post("https://quasar.yandex.ru/set_device_config", {
            params: { "device_id": this.speaker.quasar_info!.device_id, "platform": this.speaker.quasar_info!.platform },
            data: config
        });
    }

    async _command(message: string, isTTS: boolean = false) {
        const scenarioId = this.scenarios.getByEncodedId(this.speaker.id)?.id || await this.scenarios.add(this.speaker.id);
        const oldScenario = this.scenarios.get(scenarioId)!;
        
        let scenario = JSON.parse(JSON.stringify(oldScenario));
        scenario.action.type = isTTS ? "phrase_action" : "text_action";
        scenario.action.value = message;

        this.scenarios.queue.add(async () => {
            await this.scenarios.edit(scenario);
            await this.scenarios.run(scenario);
        });
    }

    async connect(url: () => string) {
        console.log(`[Колонка: ${this.speaker.id}] -> Запуск получения данных`);

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
        console.log(`[Колонка: ${this.speaker.id}] -> Обновление локального токена`);

        return this.yandex.get("https://quasar.yandex.net/glagol/token", {
            params: {
                device_id: this.speaker.quasar_info!.device_id,
                platform: this.speaker.quasar_info!.platform
            }
        }).then(resp => this.localToken = resp.data.token);
    }
}