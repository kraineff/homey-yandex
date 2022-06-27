import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import qs from "qs";
import EventEmitter from "events";

type Options = {
    uid: string,
    token: string,
    cookies: string,
    music_token?: string
}

type LoginDetails = {
    auth_url: string,
    csrf_token: string,
    track_id: string
}

class API {
    private _uid!: string;
    private _token!: string;
    private _cookies!: string;
    private _musicToken!: string;
    private _csrfToken!: string;
    private _ready: boolean;

    private _instance: AxiosInstance;
    private _events: EventEmitter;

    constructor() {
        this._ready = false;
        this._instance = axios.create({ withCredentials: true });
        this._instance.interceptors.request.use(this._handleRequest);
        this._instance.interceptors.response.use(this._handleResponse);
        this._events = new EventEmitter();
    }

    private _handleRequest = async (config: AxiosRequestConfig) => {
        if (!this._token && !this._cookies) throw new Error("Нет данных авторизации");
        if (config.url?.includes("/glagol/")) return this._handleRequestGlagol(config);

        if (!this._csrfToken) {
            const url = "https://yandex.ru/quasar?storage=1";
            const headers = { Cookie: this._cookies };

            this._csrfToken = await axios.get(url, { withCredentials: true, headers })
                .then(res => res.data.storage.csrfToken2);
        }

        config.headers = {
            ...config.headers,
            Cookie: this._cookies,
            ...(config.method && config.method !== "GET" ? { "x-csrf-token": this._csrfToken } : {})
        }

        return config;
    }

    private _handleRequestGlagol = async (config: AxiosRequestConfig) => {
        if (!this._musicToken) {
            this._musicToken = await this.getMusicToken(this._token);
            this._events.emit("musicToken", this._musicToken);
        }

        config.headers = {
            ...config.headers,
            "Authorization": `Oauth ${this._musicToken}`
        };

        return config;
    };

    private _handleResponse = async (res: AxiosResponse) => {
        if (res.status === 401) {
            this._cookies = await this.getCookies(this._token);
            return await this._instance.request(res.config);
        }

        if (res.status === 403) {
            res.config.url?.includes("/glagol/") ? this._musicToken = "": this._csrfToken = "";
            return await this._instance.request(res.config);
        }

        return res;
    }

    get uid() {
        return this._uid;
    }

    get token() {
        return this._token;
    }

    get cookies() {
        return this._cookies;
    }

    get musicToken() {
        return this._musicToken;
    }

    get ready() {
        return this._ready;
    }

    get instance() {
        return this._instance;
    }

    get events() {
        return this._events;
    }

    setCredentials(options: Options) {
        this._uid = options.uid;
        this._token = options.token;
        this._cookies = options.cookies;
        this._musicToken = options.music_token || "";
        this._ready = true;
    }

    destroy() {
        this._events.removeAllListeners();
    }

    async getLoginDetails(): Promise<LoginDetails> {
        // Получение CSRF-токена
        const csrfToken = async () => {
            const url = "https://passport.yandex.ru/am?app_platform=android";

            return await axios.get(url).then(res => {
                const content: string = res.data;
                const match = content.match('"csrf_token" value="([^"]+)"');
                if (!match) throw new Error();
                return match[0];
            });
        };

        // Получение данных авторизации
        const submit = async (csrf_token: string) => {
            const url = "https://passport.yandex.ru/registration-validations/auth/password/submit";
            const data = qs.stringify({
                retpath: "https://passport.yandex.ru/profile",
                csrf_token, with_code: 1
            });

            return await axios.post(url, data).then(res => {
                const { status, track_id, csrf_token } = res.data;

                if (status !== "ok") throw new Error();
                return {
                    auth_url: `https://passport.yandex.ru/am/push/qrsecure?track_id=${track_id}`,
                    csrf_token, track_id
                };
            });
        };

        return await csrfToken().then(async csrf_token => await submit(csrf_token));
    }

    async login(loginDetails: LoginDetails) {
        const url = "https://passport.yandex.ru/auth/new/magic/status";
        const { auth_url, ...data } = loginDetails;

        return await axios.post(url, qs.stringify(data), { maxRedirects: 0 }).then(async res => {
            const { status, errors, default_uid } = res.data;

            if (status !== "ok") {
                if (Object.keys(res.data).length === 0)
                    throw new Error("Ожидание авторизации");
                
                if (errors) {
                    if (errors.includes("account.auth_passed"))
                        throw new Error("Авторизация уже пройдена");
                    
                    if (errors.includes("track.not_found"))
                        throw new Error("Данные авторизации устарели");
                }

                throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
            }
            
            const cookies = res.headers["set-cookie"]!.join("; ");
            return await this.getToken(cookies).then(token => ({
                uid: default_uid,
                token: token,
                cookies: cookies
            }));
        });
    }

    /**
     * Проверка валидности токена
     */
    async validateToken(token: string) {
        const url = "https://mobileproxy.passport.yandex.net/1/bundle/account/short_info/?avatar_size=islands-300";
        const headers = {
            "Authorization": `OAuth ${token}`
        };

        return await axios.get(url, { withCredentials: true, headers }).then(res => {
            const { status, errors } = res.data;

            if (status !== "ok") {
                if (errors) {
                    if (errors.includes("oauth_token.invalid"))
                        throw new Error("Неверный токен");
                }

                throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);
            }

            return res.data;
        });
    }

    /**
     * Получение куки через токен
     */
    async getCookies(token: string): Promise<string> {
        const url = "https://mobileproxy.passport.yandex.net/1/bundle/auth/x_token";
        const data = qs.stringify({
            type: "x-token",
            retpath: "https://www.yandex.ru"
        });
        const headers = {
            "Ya-Consumer-Authorization": `OAuth ${token}`
        };

        return await axios.post(url, data, { withCredentials: true, headers }).then(async res => {
            const { status, track_id, passport_host } = res.data;

            if (status !== "ok") throw new Error();
            
            return await axios.get(`${passport_host}/auth/session/`, {
                withCredentials: true,
                params: { track_id },
                maxRedirects: 0,
                validateStatus: status => status === 302
            }).then(res => res.headers["set-cookie"]!.join('; '));
        });
    }

    /**
     * Получение токена через куки
     */
    async getToken(cookies: string): Promise<string> {
        const url = "https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid";
        const data = qs.stringify({
            client_id: "c0ebe342af7d48fbbbfcf2d2eedb8f9e",
            client_secret: "ad0a908f0aa341a182a37ecd75bc319e"
        });
        const headers = {
            "Ya-Client-Host": "passport.yandex.ru",
            "Ya-Client-Cookie": cookies
        };

        return await axios.post(url, data, { withCredentials: true, headers }).then(res => {
            const { status, errors, access_token } = res.data;

            if (status !== "ok") {
                if (errors.includes("sessionid.invalid"))
                    throw new Error("Недействительные куки");
            }

            return access_token;
        });
    }

    /**
     * Получение музыкального токена
     */
    async getMusicToken(token: string): Promise<string> {
        const url = "https://oauth.mobile.yandex.net/1/token";
        const data = qs.stringify({
            client_id: "23cabbbdc6cd418abb4b39c32c41195d",
            client_secret: "53bc75238f0c4d08a118e51fe9203300",
            grant_type: "x-token",
            access_token: token
        });

        return await axios.post(url, data)
            .then(res => res.data.access_token);
    }
}

export { API };           