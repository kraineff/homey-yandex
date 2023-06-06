import { YandexAPI, YandexSessionStorageHandlers } from './api';
import { YandexIot } from './client/iot';
import qs from 'querystring';

export class Yandex {
    private _api: YandexAPI;
    private _iot: YandexIot;

    constructor(storageHandlers?: YandexSessionStorageHandlers) {
        this._api = new YandexAPI(storageHandlers);
        this._iot = new YandexIot(this._api);
    }

    get request() {
        return this._api.request;
    }

    get api() {
        return this._api;
    }

    get iot() {
        return this._iot;
    }

    async getAuthorization() {
        const csrfToken = async () => await this._api.request
            .get('https://passport.yandex.ru/am?app_platform=android')
            .then(res => {
                const content: string = res.data;
                const match = content.match('"csrf_token" value="([^"]+)"');
                if (!match) throw new Error();
                return match[0];
            });
        
        const submit = async (csrf_token: string) => {
            const config = {
                url: 'https://passport.yandex.ru/registration-validations/auth/password/submit',
                method: 'post',
                data: qs.stringify({ retpath: 'https://passport.yandex.ru/profile', csrf_token, with_code: 1 })
            };

            return await this._api.request
                .request(config)
                .then(res => {
                    const { status, track_id, csrf_token } = res.data;
                    if (status !== 'ok') throw new Error();

                    return {
                        auth_url: `https://passport.yandex.ru/am/push/qrsecure?track_id=${track_id}`,
                        csrf_token, track_id
                    };
                });
        };

        return await csrfToken()
            .then(async csrf_token => await submit(csrf_token));
    }

    async confirmAuthorization(payload: any) {
        const { auth_url, ...data } = payload;
        const config = {
            url: 'https://passport.yandex.ru/auth/new/magic/status',
            method: 'post',
            data: qs.stringify(data),
            maxRedirects: 0
        };

        return await this._api.request
            .request(config)
            .then(res => {
                const { status, errors } = res.data;

                if (status !== 'ok') {
                    if (Object.keys(res.data).length === 0)
                        throw new Error('Ожидание авторизации');
                    
                    if (errors) {
                        if (errors.includes('account.auth_passed'))
                            throw new Error('Авторизация уже пройдена');
                        
                        if (errors.includes('track.not_found'))
                            throw new Error('Данные авторизации устарели');
                    }
    
                    throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
                }
            });
    }
}