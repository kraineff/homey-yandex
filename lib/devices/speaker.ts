import { Device } from "./base";
import { API } from "../api";
import { Updater } from "../updater";
import WebSocket from "ws";

type Options = {
    id: string,
    api: API,
    updater?: Updater,
}

export class Speaker extends Device {
    volume: number;
    private _local: boolean;
    private _localToken?: string;
    private _localSocket?: WebSocket;
    private _socketTimeout?: NodeJS.Timeout;
    private _socketBusy: boolean;

    constructor(options: Options) {
        super(options);
        this.volume = 0;
        this._socketBusy = false;
        this._local = false;

        if (this.id in this.updater.localSpeakers)
            this._handleLocalData({ [this.id]: this.updater.localSpeakers[this.id] });
        
        this.updater.addListener("localSpeaker", this._handleLocalData);
    }

    get local() {
        return this._local;
    }

    destroy() {
        this.updater.removeListener("localSpeaker", this._handleLocalData);
    }

    private _handleLocalData = async (data: any) => {
        if (!(this.id in data) || this._local || this._socketBusy) return;
        this._socketBusy = true;
        data = data[this.id];
        await this._startLocalConnection(data.platform, data.deviceId, data.address, data.port).catch(() => {});
    }

    async say(message: string, volume?: number) {
        const oldVolume = Number(this.volume);
        if (volume) await this.volumeSet(volume);
        await this.action([{
            type: "devices.capabilities.quasar.server_action",
            state: { instance: "phrase_action", value: message }
        }]);
        if (volume) await this.volumeSet(oldVolume);
    }

    async run(command: string, localCommand?: object) {
        if (this.id in this.updater.localSpeakers)
            this._handleLocalData({ [this.id]: this.updater.localSpeakers[this.id] });

        return this._local && localCommand ?
            await this.localAction(localCommand) :
            await this.action([{
                type: "devices.capabilities.quasar.server_action",
                state: { instance: "text_action", value: command }
            }]);
    }

    async play() {
        return await this.run("продолжить", { command: "play" });
    }

    async pause() {
        return await this.run("пауза", { command: "stop" });
    }

    async next() {
        return await this.run("следующий трек", { command: "next" });
    }

    async prev() {
        return await this.run("предыдущий трек", { command: "prev" });
    }

    async volumeSet(volume: number) {
        this.volume = volume;
        return await this.run(`громкость на ${volume * 10}`, { command: "setVolume", volume: volume });
    }

    async volumeUp(step: number = 0.1) {
        const newVolume = this.volume + step;
        if (newVolume <= 1) {
            this.volume = newVolume;
            return await this.run(`громче на ${step * 10}`, { command: "setVolume", volume: newVolume });
        }
    }

    async volumeDown(step: number = 0.1) {
        const newVolume = this.volume - step;
        if (newVolume >= 0) {
            this.volume = newVolume;
            return await this.run(`тише на ${step * 10}`, { command: "setVolume", volume: newVolume });
        }
    }

    async localAction(action: object) {
        this._localSocket!.send(JSON.stringify({
            conversationToken: this._localToken,
            payload: action
        }));
    }

    private async _startLocalConnection(platform: string, deviceId: string, address: string, port: number) {
        if (!this._localToken) this._localToken = await this._getLocalToken(platform, deviceId);
        if (this._localSocket) this._localSocket.terminate();

        const heartbeat = () => {
            if (this._socketTimeout) clearTimeout(this._socketTimeout);

            this._socketTimeout = setTimeout(() => {
                this._localSocket!.terminate();
            }, 30000 + 1000);
        };

        this._localSocket = new WebSocket(`wss://${address}:${port}`, { rejectUnauthorized: false });
        this._localSocket.addEventListener("open", async () => {
            heartbeat();
            this.localAction({ command: "softwareVersion" });
            this._local = true;
            this._socketBusy = false;
        });
        this._localSocket.on("ping", () => heartbeat());
        this._localSocket.addEventListener("message", async event => {
            const data = JSON.parse(event.data.toString());
            if ("state" in data) {
                const { state } = data;
                if (state.volume !== undefined && this.volume !== state.volume) this.volume = state.volume;
                this.updater.emit("state", { [this.id]: state });
            }
        });
        this._localSocket.addEventListener("close", () => {
            clearTimeout(this._socketTimeout);
            this._local = false;
            this._socketBusy = false;
        });
        this._localSocket.addEventListener("error", () => {
            clearTimeout(this._socketTimeout);
            this._local = false;
            this._socketBusy = false;
        });
    }

    private async _getLocalToken(platform: string, deviceId: string): Promise<string> {
        const url = "https://quasar.yandex.net/glagol/token";
        const params = { platform, device_id: deviceId };

        return this._localToken || await this.api.instance.get(url, { params })
            .then(res => this._localToken = res.data.token);
    }
}