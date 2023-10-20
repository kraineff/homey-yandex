import { YandexAPI } from './api/index';
import { YandexIot } from './client/iot';
import { YandexStorage, YandexStorageHandlers } from './storage';

export class Yandex {
    #storage: YandexStorage;
    readonly api: YandexAPI;
    readonly iot: YandexIot;

    constructor(storageHandlers?: YandexStorageHandlers) {
        this.#storage = new YandexStorage(storageHandlers);
        this.api = new YandexAPI(this.#storage);
        this.iot = new YandexIot(this.api);
    }

    get request() {
        return this.api.request;
    }

    async getAuthorization() {
        return await this.api.passport.getMagicAuthorization();
    }

    async checkAuthorization(payload: any) {
        return await this.api.passport.checkMagicAuthorization(payload);
    }
}