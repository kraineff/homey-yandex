import YandexSession from "./modules/session";
import YandexDevices from "./modules/devices";
import YandexScenarios from "./modules/scenarios";

import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from 'ws';
import EventEmitter from "events";
import { AxiosRequestConfig } from "axios";

class UpdateWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            perMessageDeflate: false
        });
    }
}

export default class Yandex extends EventEmitter {
    private _session: YandexSession;
    devices: YandexDevices;
    scenarios: YandexScenarios;

    private rws!: ReconnectingWebSocket;
    updateInterval?: NodeJS.Timer;
    scenariosUpdateTimeout?: NodeJS.Timeout;

    ready: boolean = false;

    constructor() {
        super();
        this._session = new YandexSession(this);
        this.devices = new YandexDevices(this);
        this.scenarios = new YandexScenarios(this);

        this.on("ready", async () => {
            this.devices.get().filter(device => device.initialized).forEach(async device => await device.init());
            this.ready = true
        });
        this.on("close", async () => {
            this.devices.get().filter(device => device.initialized).forEach(device => device.emit("unavailable"));

            if (this.rws) {
                console.log(`[Устройства] -> Остановка обновления устройств`);
                if (this.updateInterval) clearInterval(this.updateInterval);
                this.rws.close();
            }
            
            this.ready = false;
        });
    }

    async login(x_token?: string, cookies?: string, music_token?: string) {
        await this._session.init(x_token, cookies, music_token)
            .then(() => this.devices.refresh())
            .then(() => this.scenarios.refresh())
            .then(() => this.startUpdates())
            .then(() => this.emit("ready"))
            .catch(err => {
                if (err.message === "REAUTH_REQUIRED") this.emit("close");
            });
    }

    getAuthUrl = () => this._session.getAuthUrl();
    checkAuth = () => this._session.checkAuth();

    get = async (url: string, config: AxiosRequestConfig = {}) => this._session.request({...config, method: "GET", url});
    post = async (url: string, config: AxiosRequestConfig = {}) => this._session.request({...config, method: "POST", url});
    put = async (url: string, config: AxiosRequestConfig = {}) => this._session.request({...config, method: "PUT", url});
    options = async (url: string, config: AxiosRequestConfig = {}) => this._session.request({...config, method: "OPTIONS", url});
    delete = async (url: string, config: AxiosRequestConfig = {}) => this._session.request({...config, method: "DELETE", url});

    private async startUpdates() {
        console.log(`[Устройства] -> Запуск обновления устройств`);

        const url = async () => this.get("https://iot.quasar.yandex.ru/m/v3/user/devices").then(resp => <string>resp.data.updates_url);
        
        this.rws = new ReconnectingWebSocket(url, [], { WebSocket: UpdateWebSocket });
        //@ts-ignore
        this.rws.addEventListener("message", async (event) => {
            const data = JSON.parse(event.data);
            if (data.operation === "update_device_list") await this.devices.refresh();
            if (data.operation === "update_scenario_list") {
                if (this.scenariosUpdateTimeout) clearTimeout(this.scenariosUpdateTimeout);
                this.scenariosUpdateTimeout = setTimeout(async () => await this.scenarios.refresh(JSON.parse(data.message).scenarios), 1000);
            }
            if (data.operation === "update_states")
                JSON.parse(data.message).updated_devices.forEach((state: any) => {
                    if (state.capabilities[0]?.type === "devices.capabilities.quasar.server_action") {
                        this.emit("scenario_state", state);
                    } else {
                        const found = this.devices.getById(state.id);
                        if (found) found.emit("state", state);
                    }
                });
        });

        this.updateInterval = setInterval(() => this.rws.reconnect(), 5 * 60 * 1000);
    }
}