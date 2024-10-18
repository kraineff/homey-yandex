import { AxiosInstance } from "axios";
import { YandexStorage } from "../storage/index.mjs";
import { createInstance } from "./utils.mjs";
import { YandexPassportAPI } from "./services/passport.mjs";
import { YandexIotAPI } from "./services/iot.mjs";

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