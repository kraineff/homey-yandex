import { YandexSession } from './session';
import { YandexSessionStorage, YandexSessionStorageHandlers } from './storage';
import { YandexPassportAPI } from './passport';
import { YandexIotAPI } from './iot';
import { YandexEdaAPI } from './eda';

export class YandexAPI {
    private _storage: YandexSessionStorage;
    private _session: YandexSession;
    private _passport: YandexPassportAPI;
    private _iot: YandexIotAPI;
    private _eda: YandexEdaAPI;

    constructor(storageHandlers?: YandexSessionStorageHandlers) {
        this._storage = new YandexSessionStorage(storageHandlers);
        this._session = new YandexSession(this._storage);
        this._passport = new YandexPassportAPI(this._session, this._storage);
        this._iot = new YandexIotAPI(this._session, this._passport);
        this._eda = new YandexEdaAPI(this._session);
    }

    get request() {
        return this._session.request;
    }

    get passport() {
        return this._passport;
    }

    get iot() {
        return this._iot;
    }

    get eda() {
        return this._eda;
    }
}

export * from './storage';
export * from './session';
export * from './passport';
export * from './iot';
export * from './eda';