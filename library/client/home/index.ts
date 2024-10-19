import { YandexAPI } from "../../api/index.js";
import { YandexSpeaker } from "./devices/speaker.js";
import { YandexHomeUpdater } from "./updater.js";

export class YandexHome {
    readonly updater: YandexHomeUpdater;

    constructor(private api: YandexAPI) {
        this.updater = new YandexHomeUpdater(this.api);
    }

    async destroy() {
        await this.updater.destroy();
    }

    async createSpeaker(id: string) {
        const speaker = new YandexSpeaker(id, this.api, this.updater);
        return speaker;
    }
}