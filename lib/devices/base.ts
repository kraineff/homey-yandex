import { API } from "../api";
import { Updater } from "../updater";

type Options = {
    id: string,
    api: API,
    updater?: Updater
}

export class Device {
    private _id: string;
    private _api: API;
    private _updater: Updater;

    constructor(options: Options) {
        this._id = options.id;
        this._api = options.api;
        this._updater = options.updater || new Updater(this._api);
    }

    get id() {
        return this._id;
    }

    get api() {
        return this._api;
    }

    get updater() {
        return this._updater;
    }

    async action(actions: any[]) {
        const url = `https://iot.quasar.yandex.ru/m/user/devices/${this._id}/actions`;

        return this._api.request.post(url, { actions }).then(res => {
            const { status, errors } = res.data;

            if (status !== "ok") {
                throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
            }
        });
    }

    async getConfiguration() {
        const url = `https://iot.quasar.yandex.ru/m/v2/user/devices/${this._id}/configuration`;

        return await this._api.request.get(url)
            .then(res => res.data);
    }
}