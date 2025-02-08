import { YandexAPI } from "./api/index.js";
import { YandexHome } from "./client/home/index.js";
import { YandexStorage, type YandexStorageHandlers } from "./storage.js";

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
