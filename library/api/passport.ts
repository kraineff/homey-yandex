import qs from 'querystring';
import crypto from 'crypto';
import { YandexAPI } from "./index";
import { YandexStorage } from "../storage";

export class YandexPassportAPI {
    constructor(private api: YandexAPI, private storage: YandexStorage) {}

    createCsrfToken() {
        return crypto.randomBytes(20).toString('hex') + ':' + Date.now();
    }

    async #getToken(clientId: string, clientSecret: string) {
        return await this.storage
            .getToken(clientId)
            .catch(async () => {
                const cookieJar = await this.storage.getCookieJar();
                const cookie = await cookieJar.getCookieString('https://yandex.ru');
                const headers = { 'Ya-Client-Host': 'passport.yandex.ru', 'Ya-Client-Cookie': cookie };
                const data = qs.stringify({ client_id: clientId, client_secret: clientSecret });

                return this.api.request
                    .post('https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid', data, { headers })
                    .then(res => this.storage.setToken(clientId, res.data));
            });
    }

    async getAccountToken() {
        const cliendId = 'c0ebe342af7d48fbbbfcf2d2eedb8f9e';
        const clientSecret = 'ad0a908f0aa341a182a37ecd75bc319e';
        return await this.#getToken(cliendId, clientSecret);
    }

    async getMusicToken() {
        const cliendId = '23cabbbdc6cd418abb4b39c32c41195d';
        const clientSecret = '53bc75238f0c4d08a118e51fe9203300';
        return await this.#getToken(cliendId, clientSecret);
    }

    async getMagicAuthorization() {
        const csrf_token = this.createCsrfToken();
        const data = qs.stringify({ retpath: 'https://passport.yandex.ru/profile', csrf_token, with_code: 1 });

        return await this.api.request
            .post('https://passport.yandex.ru/registration-validations/auth/password/submit', data)
            .then(res => {
                const { track_id, csrf_token } = res.data;

                return {
                    auth_url: `https://passport.yandex.ru/am/push/qrsecure?track_id=${track_id}`,
                    csrf_token, track_id
                };
            });
    }

    async checkMagicAuthorization(payload: any) {
        const { auth_url, ...data } = payload;
        const config = { maxRedirects: 0 };

        return await this.api.request
            .post('https://passport.yandex.ru/auth/new/magic/status', qs.stringify(data), config)
            .then(res => {
                const { status, errors } = res.data;

                if (Object.keys(res.data).length === 0)
                        throw new Error('Ожидание авторизации');

                if (errors) {
                    if (errors.includes('account.auth_passed'))
                        throw new Error('Авторизация уже пройдена');
                    
                    if (errors.includes('track.not_found'))
                        throw new Error('Данные авторизации устарели');
                }

                if (status !== 'ok')
                    throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
            });
    }
}