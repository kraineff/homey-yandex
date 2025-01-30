import type { AxiosInstance } from "axios";
import { YandexStorage } from "../storage.js";
import { YandexAliceAPI } from "./services/alice.js";
import { YandexMusicAPI } from "./services/music.js";
import { YandexPassportAPI } from "./services/passport.js";
import { YandexQuasarAPI } from "./services/quasar.js";
import { createInstance } from "./utils.js";

export class YandexAPI {
    readonly request: AxiosInstance;
    readonly alice: YandexAliceAPI;
    readonly music: YandexMusicAPI;
    readonly passport: YandexPassportAPI;
    readonly quasar: YandexQuasarAPI;

    constructor(storage: YandexStorage) {
        this.request = createInstance(storage, config => config);
        this.alice = new YandexAliceAPI(storage);
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