import { API } from "../api";
import { Updater } from "../updater";

type Options = {
    id: string,
    api: API,
    updater?: Updater
}

export class Device {
    private _options: Options;

    constructor(options: Options) {
        options.updater = options.updater || new Updater(options.api);
        this._options = options;
    }

    get id() {
        return this._options.id;
    }

    get api() {
        return this._options.api;
    }

    get updater() {
        return this._options.updater!;
    }

    async action(actions: any[]) {
        const url = `https://iot.quasar.yandex.ru/m/user/devices/${this._options.id}/actions`;

        return this._options.api.request.post(url, { actions }).then(res => {
            const { status, errors } = res.data;
            if (status !== "ok")
                throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
        });
    }
}