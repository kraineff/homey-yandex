import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { YandexSessionStorage } from './storage';

export class YandexSession {
    private _instance: AxiosInstance;
    private _storage: YandexSessionStorage;

    get request() {
        return this._instance;
    }

    constructor(storage: YandexSessionStorage) {
        this._instance = axios.create({
            withCredentials: true,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15',
                'Accept-Language': 'ru',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        this._instance.interceptors.request.use(this._handleRequest);
        this._instance.interceptors.response.use(this._handleResponse);
        this._storage = storage;
    }

    private _handleRequest = async (req: InternalAxiosRequestConfig) => {
        const url = req.url;

        if (url) {
            const cookieJar = await this._storage.getCookieJar();
            const cookie = await cookieJar.getCookieString(url);
            cookie && req.headers.set('Cookie', cookie);
        }
        return req;
    };

    private _handleResponse = async (res: AxiosResponse) => {
        const url = res.config.url!;
        const cookie = res.headers['set-cookie'];

        if (cookie) {
            const cookieJar = await this._storage.getCookieJar();
            await Promise.all(cookie.map(element => cookieJar.setCookie(element, url)));
            await this._storage.setCookieJar(cookieJar);
        }
        return res;
    };
}