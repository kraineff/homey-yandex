import type { YandexAPI } from "../../api/index.js";
import { YandexMediaDevice } from "./devices/media.js";
import { YandexHomeUpdater } from "./updater.js";

export class YandexHome {
	#api: YandexAPI;
	readonly updater: YandexHomeUpdater;

	constructor(api: YandexAPI) {
		this.#api = api;
		this.updater = new YandexHomeUpdater(this.#api);
	}

	async disconnect() {
		await this.updater.disconnect();
	}

	async createMediaDevice(id: string) {
		const media = new YandexMediaDevice(id, this.#api, this.updater);
		return media;
	}
}
