import { YandexAPI } from '../../api';
import { YandexIotUpdater } from './updater';
import { YandexIotSpeaker } from './devices/speaker';

export class YandexIot {
    private _api: YandexAPI;
    private _updater?: YandexIotUpdater;
    private _updaterPromise?: Promise<void>;

    constructor(api: YandexAPI) {
        this._api = api;
    }

    async getUpdater() {
        if (!this._updater) this._updater = new YandexIotUpdater(this._api);
        if (!this._updaterPromise) this._updaterPromise = this._updater.init();
        await Promise.resolve(this._updaterPromise).catch(error => {
            this._updaterPromise = undefined;
            throw error;
        });
        return this._updater;
    }

    async getSpeaker(id: string) {
        const updater = await this.getUpdater();
        const speaker = new YandexIotSpeaker(id, this._api, updater);
        return speaker;
    }
}

export * from './updater';
export * from './devices';
export * from './types';