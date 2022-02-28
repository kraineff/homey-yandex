import EventEmitter from "events";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import qs from "qs";

export default class YandexSession extends EventEmitter {
    session: AxiosInstance;
    x_token!: string;
    cookie!: string;
    music_token!: string;

    csrf_token: string = "";
    auth_payload: any;
    ready: boolean = false;

    constructor() {
        super();

        this.session = axios.create({ withCredentials: true, validateStatus: () => true });
        this.session.interceptors.request.use(config => {
            if (this.cookie) config.headers = { ...config.headers, "Cookie": this.cookie };
            return config;
        });

        this.on("available", (status) => this.ready = status);
    }

    async init(x_token: string, cookie: string, music_token: string) {
        console.log("[Session] -> Инициализация сессии");

        this.x_token = x_token;
        this.music_token = music_token;
        this.cookie = cookie;

        if ((await this.session.get("https://yandex.ru/quasar?storage=1")).data.storage.user.uid) {
            this.emit("available", true, true);
            return true;
        } else {
            let cookies = await this.refreshCookies();
            this.emit("available", cookies, true);
            return cookies;
        }
    }

    async getAuthUrl() {
        console.log("[Session] -> Получение ссылки авторизации");

        let response = await this.session.get("https://passport.yandex.ru/am?app_platform=android");
        let match = response.data.match('"csrf_token" value="([^"]+)"');
        if (!match) throw response.data;

        response = await this.session({
            method: "POST",
            url: "https://passport.yandex.ru/registration-validations/auth/password/submit",
            data: qs.stringify({
                csrf_token: match[1],
                retpath: "https://passport.yandex.ru/profile",
                with_code: 1
            })
        });
        if (response.data.status !== "ok") throw response.data;
        this.auth_payload = {
            csrf_token: response.data.csrf_token,
            track_id: response.data.track_id
        }

        return `https://passport.yandex.ru/am/push/qrsecure?track_id=${response.data.track_id}`
    }

    async checkAuth() {
        console.log("[Session] -> Проверка авторизации");
        
        let response = await this.session({
            method: "POST",
            url: "https://passport.yandex.ru/auth/new/magic/status/",
            data: qs.stringify(this.auth_payload)
        });
        if (response.data.status !== "ok") return false;
        
        this.setProperties({ "cookie": response.headers["set-cookie"]!.join('; ') });
        await this.getTokenFromCookie();
        this.emit("available", true, true);
        return true
    }

    async getTokenFromCookie() {
        console.log("[Session] -> Получение токена через куки");

        let response = await this.session({
            method: "POST",
            url: "https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid",
            data: qs.stringify({
                client_id: "c0ebe342af7d48fbbbfcf2d2eedb8f9e",
                client_secret: "ad0a908f0aa341a182a37ecd75bc319e"
            }),
            headers: {
                "Ya-Client-Host": "passport.yandex.ru",
                "Ya-Client-Cookie": this.cookie
            }
        });

        this.setProperties({ "x_token": response.data.access_token });
    }

    async refreshCookies() {
        console.log("[Session] -> Обновление куки");

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
        if (response.data.status !== "ok") return false;

        response = await this.session({
            method: "GET",
            url: `${response.data.passport_host}/auth/session/`,
            params: {
                "track_id": response.data.track_id
            },
            maxRedirects: 0
        });
        if (response.status !== 302) return false;

        this.setProperties({ "cookie": response.headers["set-cookie"]!.join('; ') });
        return true;
    }

    async getMusicToken() {
        console.log("[Session] -> Получение музыкального токена");

        let response = await this.session.post("https://oauth.mobile.yandex.net/1/token", qs.stringify({
            client_secret: "53bc75238f0c4d08a118e51fe9203300",
            client_id: "23cabbbdc6cd418abb4b39c32c41195d",
            grant_type: "x-token",
            access_token: this.x_token
        }));

        if (!response.data["access_token"]) this.emit("available", false);
        else this.setProperties({ "music_token": response.data["access_token"] });
    }

    // Запросы
    async request(config: AxiosRequestConfig, retry: number = 2): Promise<any> {
        if (config.url!.includes("/glagol/")) {
            if (!this.music_token) await this.getMusicToken();
            config.headers = { ...config.headers, "Authorization": `Oauth ${this.music_token}` };
        }

        if (config.method !== "GET") {
            if (!this.csrf_token) {
                let response = await this.session.get("https://yandex.ru/quasar")
                let match = response.data.match('"csrfToken2":"(.+?)"');
                if (match) this.csrf_token = match[1];
            }

            config.headers = { ...config.headers, "x-csrf-token": this.csrf_token };
        }
        
        let response = await this.session(config);
        if (response.status === 200) return response.data; // 200 - OK
        else if (response.status === 400) retry = 0; // 400 - bad request
        else if (response.status === 401) this.emit("available", await this.refreshCookies()) // 401 - no cookies
        else if (response.status === 403) config.url!.includes("/glagol/") ? this.music_token = "" : this.csrf_token = "";

        if (retry) return await this.request(config, retry - 1);
    }

    setProperties(data: any) {
        Object.keys(data).forEach(key => {
            let value = data[key];
            if (key === "cookie") this.cookie = value;
            if (key === "x_token") this.x_token = value;
            if (key === "music_token") this.music_token = value;
        });

        this.emit("update", data);
    }
}