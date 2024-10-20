import { AxiosInstance } from "axios";
import { YandexStorage } from "../storage/index.js";
import { createInstance } from "./utils.js";
import { YandexPassportAPI } from "./services/passport.js";
import { YandexQuasarAPI } from "./services/quasar.js";
import { YandexMusicAPI } from "./services/music.js";

export class YandexAPI {
    readonly request: AxiosInstance;
    readonly passport: YandexPassportAPI;
    readonly quasar: YandexQuasarAPI;
    readonly music: YandexMusicAPI;

    constructor(storage: YandexStorage) {
        this.request = createInstance(storage, config => config);
        this.passport = new YandexPassportAPI(storage);
        this.quasar = new YandexQuasarAPI(storage, this.passport);
        this.music = new YandexMusicAPI(storage, this.passport);
    }

    async getAuthorization() {
        return await this.passport.getMagicAuthorization();
    }

    async checkAuthorization(payload: any) {
        return await this.passport.checkMagicAuthorization(payload);
    }
}