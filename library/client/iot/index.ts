import { YandexAPI } from '../../api';
import { YandexIotUpdater } from './updater';
import { YandexIotSpeaker } from './devices/speaker';

export class YandexIot {
    readonly updater: YandexIotUpdater;

    constructor(private api: YandexAPI) {
        this.updater = new YandexIotUpdater(api);
    }

    async createSpeaker(deviceId: string) {
        const speaker = new YandexIotSpeaker(deviceId, this.api, this.updater);
        return speaker;
    }
}

export * from './updater';
export * from './devices';
export * from './types';