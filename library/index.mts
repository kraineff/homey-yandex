import { YandexAPI } from "./api/index.mjs";
import { YandexHome } from "./client/home/index.mjs";
import { YandexStorage } from "./storage/index.mjs";
import { YandexStorageHandlers } from "./storage/typings.mjs";

export class Yandex {
    readonly storage: YandexStorage;
    readonly api: YandexAPI;
    readonly home: YandexHome;

    constructor(storageHandlers: YandexStorageHandlers) {
        this.storage = new YandexStorage(storageHandlers);
        this.api = new YandexAPI(this.storage);
        this.home = new YandexHome(this.api);
    }
}