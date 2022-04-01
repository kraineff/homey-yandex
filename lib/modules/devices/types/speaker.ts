import Yandex from '../../../yandex';
import YandexDeviceBase from "./base";
import WebSocket from 'ws';
import ReconnectingWebSocket from "reconnecting-websocket";
import { diff } from "deep-object-diff";
import { v4 } from "uuid";
import { SpeakerData } from '../types';

class SpeakerWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            perMessageDeflate: false,
            rejectUnauthorized: false
        });
    }
}

export default class YandexSpeaker extends YandexDeviceBase {
    local: boolean;
    volume: number;
    data!: SpeakerData;

    private localSocket?: ReconnectingWebSocket;
    private localToken?: string;
    private localState?: object;

    constructor(yandex: Yandex, id: string) {
        super(yandex, id);
        this.local = false;
        this.volume = 0;
    }

    async setAvailable() {
        this.yandex.devices.discovery.addListener("result", this.handleDiscoveryResult);
        await this.startLocalSocket(this.yandex.devices.discovery.results[this.data.settings.quasar_info.device_id]);
        await super.setAvailable();
    }
    
    async setUnavailable(reason: "NO_AUTH" | "REMOVED" | "CLOSED" = "CLOSED") {
        this.yandex.devices.discovery.removeListener("result", this.handleDiscoveryResult);
        await this.stopLocalConnection();
        await super.setUnavailable(reason);
    }

    private handleDiscoveryResult = async (result: any) => {
        if (this.data.settings.quasar_info.device_id !== result.id) return;
        await this.startLocalSocket(result);
    }

    async say(message: string, volume?: number) {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Произнести текст -> ${message}`);
        
        const oldVolume = Number(this.volume);
        if (volume) await this.volumeSet(volume);
        await this.cloudAction({ instance: "phrase_action", value: message });
        if (volume) await this.volumeSet(oldVolume);
    }

    async run(command: string, localCommand?: object) {
        return this.local && localCommand ? this.localAction(localCommand) : this.cloudAction({ instance: "text_action", value: command });
    }
    
    async play() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Продолжение музыки`);

        return this.run("продолжить", { command: "play" });
    }

    async pause() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Остановка музыки`);
        
        return this.run("пауза", { command: "stop" });
    }

    async next() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Следующий трек`);
        
        return this.run("следующий трек", { command: "next" });
    }

    async prev() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Предыдущий трек`);
        
        return this.run("предыдущий трек", { command: "prev" });
    }

    async volumeSet(volume: number) {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Установка громкости -> ${volume}`);
        
        this.volume = volume;
        return this.run(`громкость на ${volume}`, { command: "setVolume", volume: volume / 10 });
    }

    async volumeUp(step: number = 1) {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Повышение громкости`);
        
        const newVolume = this.volume + step;
        if (newVolume <= 10) {
            this.volume = newVolume;
            return this.run(`громче на ${newVolume}`, { command: "setVolume", volume: newVolume / 10 });
        }
    }

    async volumeDown(step: number = 1) {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Понижение громкости`);
        
        const newVolume = this.volume - step;
        if (newVolume >= 0) {
            this.volume = newVolume;
            return this.run(`тише на ${newVolume}`, { command: "setVolume", volume: newVolume / 10 });
        }
    }

    async setSettings() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Установка настроек`);
        
        return this.yandex.session.options({
            method: "POST",
            url: `https://iot.quasar.yandex.ru/m/v3/user/devices/${this.id}/configuration/quasar`,
            data: { config: this.data.settings.quasar_config, version: this.data.settings.quasar_config_version }
        }).then(resp => {
            this.data.settings.quasar_config_version = resp.data.version;
        });
    }

    private async cloudAction(action: object) {
        await this.yandex.session.post(`https://iot.quasar.yandex.ru/m/user/devices/${this.id}/actions`, {
            data: {
                actions: [{
                    type: "devices.capabilities.quasar.server_action",
                    state: action
                }]
            }
        });
    }

    private async localAction(action: object) {
        this.localSocket!.send(JSON.stringify({
            conversationToken: this.localToken,
            payload: action,
            id: v4(),
            sentTime: Date.now()
        }));
    }

    private async startLocalSocket(result?: any) {
        if (!result) return;
        await this.stopLocalConnection();
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Запуск локальных данных`);
        
        this.local = true;
        if (!this.localToken) await this.getLocalToken();
        this.localSocket = new ReconnectingWebSocket(`wss://${result.address}:${result.port}`, [], { WebSocket: SpeakerWebSocket });
        //@ts-ignore
        this.localSocket.addEventListener("open", async () => await this.localAction({ command: "softwareVersion" }));
        //@ts-ignore
        this.localSocket.addEventListener("message", async event => {
            const data = JSON.parse(event.data);
            if (data?.state) {
                const { state } = data;
                delete state.timeSinceLastVoiceActivity;
                delete state.playerState.duration;
                delete state.playerState.progress;

                const difference: any = diff(this.localState || {}, state);
                if (!Object.keys(difference).length) return;
                this.localState = state;
                if (difference.volume !== undefined) this.volume = difference.volume * 10;
                this.emit("state", difference);
            }
        });
        //@ts-ignore
        this.localSocket.addEventListener("close", async event => {
            if (event.code === 4000) await this.getLocalToken();
        });
    }

    private async stopLocalConnection() {
        if (!this.localSocket) return;
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Завершение локальных данных`);
        
        this.localSocket.close();
    }

    private async getLocalToken() {
        if (this.yandex.options?.debug)
            console.log(`[Колонка: ${this.id}] -> Получение локального токена`);
        
        this.localToken = await this.yandex.session.get("https://quasar.yandex.net/glagol/token", {
            params: {
                device_id: this.data.settings.quasar_info.device_id,
                platform: this.data.settings.quasar_info.platform
            }
        }).then(resp => resp.data.token);
    }
}