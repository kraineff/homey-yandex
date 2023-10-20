import { YandexAPI } from '../../api';
import { YandexIotUpdater } from './updater';
import { YandexIotSpeaker } from './devices/speaker';

export class YandexIot {
    #updater?: YandexIotUpdater;
    #updaterPromise?: Promise<void>;

    constructor(private api: YandexAPI) {}

    async getUpdater() {
        if (!this.#updater) this.#updater = new YandexIotUpdater(this.api);
        if (!this.#updaterPromise) this.#updaterPromise = this.#updater.init();

        await Promise.resolve(this.#updaterPromise).catch(error => {
            this.#updaterPromise = undefined;
            throw error;
        });
        return this.#updater;
    }

    async createSpeaker(deviceId: string) {
        const updater = await this.getUpdater();
        const speaker = new YandexIotSpeaker(deviceId, this.api, updater);
        return speaker;
    }
}

export * from './updater';
export * from './devices';
export * from './types';