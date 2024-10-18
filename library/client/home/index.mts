import { YandexAPI } from "../../api/index.mjs";
import { YandexSpeaker } from "./devices/speaker.mjs";
import { YandexHomeUpdater } from "./updater.mjs";

export class YandexHome {
    readonly updater: YandexHomeUpdater;

    constructor(private api: YandexAPI) {
        this.updater = new YandexHomeUpdater(this.api);
    }

    async connect() {
        await this.updater.connect();
    }

    async disconnect() {
        await this.updater.disconnect();
    }

    async createSpeaker(id: string) {
        const speaker = new YandexSpeaker(id, this.api, this.updater);
        return speaker;
    }
}