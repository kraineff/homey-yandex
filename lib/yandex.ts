import YandexSession from "./session";
import YandexUpdates from "./modules/updates";
import YandexDevices from "./modules/devices";
import YandexScenarios from "./modules/scenarios";
import EventEmitter from "events";
import { YandexMusic } from "./modules/music";

type Module = "devices" | "scenarios" | "music";

type YandexOptions = {
    modules?: Module[]
    debug?: boolean
}

export default class Yandex extends EventEmitter {
    session: YandexSession;
    updates: YandexUpdates;
    devices: YandexDevices;
    scenarios: YandexScenarios;
    music: YandexMusic;

    readonly options?: YandexOptions;
    readonly modules?: Module[];

    ready: boolean = false;

    constructor(options?: YandexOptions) {
        super();
        this.session = new YandexSession(this);
        this.updates = new YandexUpdates(this);
        this.devices = new YandexDevices(this);
        this.scenarios = new YandexScenarios(this);
        this.music = new YandexMusic(this);

        this.options = options;
        this.modules = options?.modules ? [...new Set(options.modules)] : undefined;

        this.on("ready", () => this.ready = true);
        this.on("close", () => this.ready = false);
    }

    async login(x_token?: string, cookies?: string, music_token?: string) {
        if (this.options?.debug)
            console.log("[Яндекс] -> Вход в аккаунт");

        return this.session.init(x_token, cookies, music_token).then(async () => {
            if (this.options?.debug) console.log("[Яндекс] -> Успешная авторизация");
            if (!this.modules || (this.modules.includes("devices") || this.modules.includes("scenarios"))) await this.updates.init();
            if (!this.modules || this.modules.includes("devices")) await this.devices.init();
            if (!this.modules || this.modules.includes("scenarios")) await this.scenarios.update();
            this.emit("ready");
        }).catch(async () => {
            if (this.options?.debug) console.log("[Яндекс] -> Ошибка авторизации");
            await this.logout();
        });
    }

    async logout() {
        if (this.options?.debug)
            console.log("[Яндекс] -> Выход из аккаунта");

        if (!this.modules || (this.modules.includes("devices") || this.modules.includes("scenarios"))) await this.updates.close();
        if (!this.modules || this.modules.includes("devices")) await this.devices.close();
        this.emit("close");
    }

    async removeRoom(roomId: string) {
        return this.session.options({
            url: `https://iot.quasar.yandex.ru/m/user/rooms/${roomId}`,
            method: "DELETE"
        });
    }
}