import Yandex from "../yandex";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import promiseRetry from "promise-retry";
import qs from "qs";

export default class YandexSession {
    yandex: Yandex;
    session: AxiosInstance;

    x_token: string = "";
    cookies: string = "";
    music_token: string = "";
    csrf_token: string = "";
    auth_payload: any;

    constructor(yandex: Yandex) {
        this.yandex = yandex;

        this.session = axios.create({ withCredentials: true, validateStatus: () => true });
        this.session.interceptors.request.use(async config => {
            if (this.cookies) config.headers = { ...config.headers, "Cookie": this.cookies };
            return config;
        });
    }

    async init(x_token?: string, cookies?: string, music_token?: string) {
        if (x_token) this.x_token = x_token;
        if (cookies) this.cookies = cookies;
        if (music_token) this.music_token = music_token;

        return this.checkCookies();
    }

    async getAuthUrl() {
        console.log("[Yandex] -> Получение ссылки авторизации");
        
        return this.session.get("https://passport.yandex.ru/am?app_platform=android").then(resp => {
            const match = resp.data.match('"csrf_token" value="([^"]+)"');
            if (!match) throw new Error("REAUTH_REQUIRED");

            return this.session({
                method: "POST",
                url: "https://passport.yandex.ru/registration-validations/auth/password/submit",
                data: qs.stringify({
                    csrf_token: match[1],
                    retpath: "https://passport.yandex.ru/profile",
                    with_code: 1
                })
            }).then(resp => {
                if (resp.data?.status !== "ok") throw new Error("REAUTH_REQUIRED");
                this.auth_payload = {
                    csrf_token: resp.data.csrf_token,
                    track_id: resp.data.track_id
                }
                return `https://passport.yandex.ru/am/push/qrsecure?track_id=${resp.data.track_id}`;
            })
        });
    }

    async checkAuth(timeout: number = 5000) {
        console.log("[Yandex] -> Проверка авторизации");

        return promiseRetry((retry, attempt) => {
            return this.session({
                method: "POST",
                url: "https://passport.yandex.ru/auth/new/magic/status/",
                data: qs.stringify(this.auth_payload)
            }).then(resp => {
                if (resp.data?.status !== "ok") throw new Error("AUTH_FAILED");
                this.setProperties({ "cookies": resp.headers["set-cookie"]!.join('; ') });
                return this.getTokenFromCookies().then(() => true);
            });
        }, { retries: 100, factor: 1, minTimeout: timeout })
            .then(async () => await this.yandex.login())
            .catch((error) => { throw error });
    }

    async getTokenFromCookies() {
        console.log("[Yandex] -> Получение токена через куки");

        return this.session({
            method: "POST",
            url: "https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid",
            data: qs.stringify({
                client_id: "c0ebe342af7d48fbbbfcf2d2eedb8f9e",
                client_secret: "ad0a908f0aa341a182a37ecd75bc319e"
            }),
            headers: {
                "Ya-Client-Host": "passport.yandex.ru",
                "Ya-Client-Cookie": this.cookies
            }
        }).then(resp => {
            if (!resp.data?.access_token) throw new Error("INVALID_COOKIES");
            this.setProperties({ "x_token": resp.data.access_token });
        });
    }

    async checkCookies() {
        console.log("[Yandex] -> Проверка куки");

        return this.session.get("https://yandex.ru/quasar?storage=1").then(resp => {
            if (resp.data.storage.user.uid) return true;
            return this.updateCookies().then(status => {
                if (!status) throw new Error("REAUTH_REQUIRED");
                return true;
            })
        });
    }

    async updateCookies() {
        console.log("[Yandex] -> Обновление куки");

        this.cookies = "";
        let response = await this.session({
            method: "POST",
            url: "https://mobileproxy.passport.yandex.net/1/bundle/auth/x_token/",
            data: qs.stringify({
                type: "x-token",
                retpath: "https://www.yandex.ru"
            }),
            headers: {
                "Ya-Consumer-Authorization": `OAuth ${this.x_token}`
            }
        });
        if (response.data?.status !== "ok") return false;

        response = await this.session({
            method: "GET",
            url: `${response.data.passport_host}/auth/session/`,
            params: {
                "track_id": response.data.track_id
            },
            maxRedirects: 0
        });
        if (response.status !== 302) return false;

        this.setProperties({ "cookies": response.headers["set-cookie"]!.join('; ') });
        return true;
    }

    async updateMusicToken() {
        console.log("[Yandex] -> Обновление музыкального токена");

        return this.session.post("https://oauth.mobile.yandex.net/1/token", qs.stringify({
            client_secret: "53bc75238f0c4d08a118e51fe9203300",
            client_id: "23cabbbdc6cd418abb4b39c32c41195d",
            grant_type: "x-token",
            access_token: this.x_token
        })).then(resp => {
            if (!resp.data?.access_token) throw new Error("REAUTH_REQUIRED");
            this.setProperties({ "music_token": resp.data.access_token });
            return this.music_token;
        });
    }

    async request(config: AxiosRequestConfig) {
        return <Promise<AxiosResponse<any, any>>>promiseRetry(async (retry, attempt) => {
            if (config.url!.includes("/glagol/")) {
                if (!this.music_token) await this.updateMusicToken();
                config.headers = { ...config.headers, "Authorization": `Oauth ${this.music_token}` };
            }
    
            if (config.method !== "GET") {
                if (!this.csrf_token) await this.session.get("https://yandex.ru/quasar").then(resp => {
                    const match = resp.data.match('"csrfToken2":"(.+?)"');
                    if (match) this.csrf_token = match[1];
                });
    
                config.headers = {...config.headers, "x-csrf-token": this.csrf_token};
            }
    
            return this.session(config).then(async resp => {
                if (resp.status === 401) await this.checkCookies();
                if (resp.status === 403) {
                    config.url!.includes("/glagol/") ? this.music_token = "" : this.csrf_token = "";
                    if (attempt === 2) await this.updateCookies();
                    throw new Error(resp.data.message);
                }

                if (resp.status === 200 && resp.data?.status !== "ok") throw new Error(resp.data.message);
                return resp;
            });
        }, { retries: 3 }).catch(err => {
            if (["REAUTH_REQUIRED", "CSRF_TOKEN_INVALID"].includes(err.message)) {
                this.yandex.emit("close");
                err = new Error("Требуется повторная авторизация");
            }
            throw err;
        });
    }

    setProperties(data: any) {
        Object.keys(data).forEach(key => {
            const value = data[key];
            if (key === "cookies") this.cookies = value;
            if (key === "x_token") this.x_token = value;
            if (key === "music_token") this.music_token = value;
        });

        this.yandex.emit("update", data);
    }
}