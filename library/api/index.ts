import http from 'http';
import https from 'https';
import axios, { AxiosInstance } from 'axios';
import { YandexStorage } from '../storage';
import { YandexPassportAPI } from './passport';
import { YandexIotAPI } from './iot';

export class YandexAPI {
    readonly request: AxiosInstance;
    readonly passport: YandexPassportAPI;
    readonly iot: YandexIotAPI;

    constructor(private storage: YandexStorage) {        
        this.request = axios.create({
            withCredentials: true,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15',
                'Accept-Language': 'ru'
            }
        });

        this.request.interceptors.request.use(async config => {
            if (config.url !== undefined) {
                const cookieJar = await this.storage.getCookieJar();
                const cookie = await cookieJar.getCookieString(config.url);
                cookie && config.headers.set('Cookie', cookie);
            }
            return config;
        });

        this.request.interceptors.response.use(async response => {
            const url = response.config.url;
            const cookie = response.headers['set-cookie'];

            if (url !== undefined && cookie !== undefined) {
                const cookieJar = await this.storage.getCookieJar();
                await Promise.all(cookie.map(item => cookieJar.setCookie(item, url)));
                await this.storage.setCookieJar(cookieJar);
            }
            return response;
        });

        this.passport = new YandexPassportAPI(this, this.storage);
        this.iot = new YandexIotAPI(this, this.passport);
    }
}