import YandexSession from "./modules/session";
import YandexDevices from "./modules/devices";
import YandexScenarios from "./modules/scenarios";
import YandexSpeaker from "./devices/speaker";
import YandexDevice from "./devices/base";

import EventEmitter from "events";
import { AxiosRequestConfig } from "axios";

export default class Yandex extends EventEmitter {
    session: YandexSession;
    devices: YandexDevices;
    scenarios: YandexScenarios;

    speakers_: YandexSpeaker[] = [];
    devices_: YandexDevice[] = [];
    ready: boolean = false;

    constructor() {
        super();
        this.session = new YandexSession(this);
        this.devices = new YandexDevices(this);
        this.scenarios = new YandexScenarios(this);

        this.on("ready", () => this.ready = true);
        this.on("reauth_required", async () => {
            await this.close();
            this.ready = false;
        });
    }

    async connect(x_token?: string, cookies?: string, music_token?: string) {
        await this.session.init(x_token, cookies, music_token)
            .then(() => console.log("[Yandex] -> Успешная авторизация"))
            .then(() => this.devices.init())
            .then(() => this.scenarios.init())
            .then(() => this.emit("ready"))
            .catch(err => {
                if (err.message === "REAUTH_REQUIRED") this.emit("reauth_required");
            });
    }

    async close() {
        this.speakers_.forEach(async speaker => await speaker.close());
        this.devices_.forEach(async device => await device.close());
        await this.devices.close();
    }

    createSpeaker = (id: string) => new YandexSpeaker(this, id);
    createDevice = (id: string) => new YandexDevice(this, id);

    get = async (url: string, config: AxiosRequestConfig = {}) => this.session.request({...config, method: "GET", url});
    post = async (url: string, config: AxiosRequestConfig = {}) => this.session.request({...config, method: "POST", url});
    put = async (url: string, config: AxiosRequestConfig = {}) => this.session.request({...config, method: "PUT", url});
}