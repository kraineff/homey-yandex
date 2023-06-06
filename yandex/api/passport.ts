import { YandexSession } from './session';
import { YandexSessionStorage, YandexSessionStorageTokens } from './storage';
import { AxiosRequestConfig } from 'axios';
import qs from 'querystring';

export class YandexPassportAPI {
    private _session: YandexSession;
    private _storage: YandexSessionStorage;

    constructor(session: YandexSession, storage: YandexSessionStorage) {
        this._session = session;
        this._storage = storage;
    }

    async getToken(service: keyof YandexSessionStorageTokens) {
        const token = await this._storage.getToken(service);
        if (token) return token;

        const cookieJar = await this._storage.getCookieJar();
        const cookie = await cookieJar.getCookieString('https://yandex.ru');
        const tokenData = {
            am: ['c0ebe342af7d48fbbbfcf2d2eedb8f9e', 'ad0a908f0aa341a182a37ecd75bc319e'],
            music: ['23cabbbdc6cd418abb4b39c32c41195d', '53bc75238f0c4d08a118e51fe9203300']
        }[service];

        const config: AxiosRequestConfig = {
            url: 'https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid',
            method: 'post',
            data: qs.stringify({ client_id: tokenData[0], client_secret: tokenData[1] }),
            headers: { 'Ya-Client-Host': 'passport.yandex.ru', 'Ya-Client-Cookie': cookie }
        };

        return await this._session.request(config).then(async res => {
            await this._storage.setToken(service, res.data);
            return res.data.access_token as string;
        });
    }
}