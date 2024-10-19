import { AxiosInstance } from "axios";
import { YandexStorage } from "../storage/index.js";
import { createInstance } from "./utils.js";
import { YandexPassportAPI } from "./services/passport.js";
import { YandexIotAPI } from "./services/iot.js";

export class YandexAPI {
    readonly request: AxiosInstance;
    readonly passport: YandexPassportAPI;
    readonly iot: YandexIotAPI;

    constructor(storage: YandexStorage) {
        this.request = createInstance(storage, config => config);
        this.passport = new YandexPassportAPI(storage);
        this.iot = new YandexIotAPI(storage, this.passport);
    }

    async getAuthorization() {
        return await this.passport.getMagicAuthorization();
    }

    async checkAuthorization(payload: any) {
        return await this.passport.checkMagicAuthorization(payload);
    }
}