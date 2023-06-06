import { YandexSession } from '../session';
import { YandexPassportAPI } from '../passport';
import { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

export class YandexIotAPI {
    private _session: YandexSession;
    private _passport: YandexPassportAPI;
    private _csrfToken?: string;

    constructor(session: YandexSession, passport: YandexPassportAPI) {
        this._session = session;
        this._passport = passport;
        this._session.request.interceptors.request.use(this._handleRequest);
    }

    private _isQuasarUrl(url: string) {
        return ['quasar.yandex.ru', 'iot.quasar.yandex.ru'].find(quasarUrl => url.includes(quasarUrl));
    }

    private _handleRequest = async (req: InternalAxiosRequestConfig) => {
        const { url, method, headers } = req;

        if (this._isQuasarUrl(url ?? '') && method) {
            headers.set('Accept', '*/*');
            headers.set('Origin', 'https://yandex.ru');
            headers.set('Referer', 'https://yandex.ru/');

            ['post', 'put', 'patch', 'delete'].includes(method) &&
                headers.set('x-csrf-token', await this._getCSRFToken());
        }
        return req;
    };

    private async _getCSRFToken() {
        if (this._csrfToken) return this._csrfToken;

        return await this._session.request.get('https://quasar.yandex.ru/csrf_token')
            .then(res => this._csrfToken = res.data.token as string);
    }

    async getDevices() {
        return await this._session.request
            .get('https://iot.quasar.yandex.ru/m/v3/user/devices')
            .then(res => res.data as any);
    }

    async runDeviceAction(id: string, actions: any[]) {
        return await this._session.request
            .post(`https://iot.quasar.yandex.ru/m/user/devices/${id}/actions`, { actions })
            .then(() => {});
    }

    async getGlagolDevices() {
        return await this._session.request
            .get('https://quasar.yandex.ru/glagol/device_list')
            .then(res => res.data.devices);
    }

    async getGlagolToken(deviceId: string, platform: string) {
        const token = await this._passport.getToken('music');
        const config: AxiosRequestConfig = {
            url: 'https://quasar.yandex.ru/glagol/token',
            method: 'get',
            params: { device_id: deviceId, platform },
            headers: { Authorization: 'OAuth ' + token }
        };

        return await this._session.request(config)
            .then(res => res.data.token as string);
    }
}