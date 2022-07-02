import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import axiosRetry from 'axios-retry';
import EventEmitter from "events";
import qs from "qs";

type Credentials = {
    uid: string,
    token: string,
    cookies?: string,
    musicToken?: string
}

type LoginDetails = {
    auth_url: string,
    csrf_token: string,
    track_id: string
}

class API extends EventEmitter {
    private _request: AxiosInstance;
    private _credentials?: Credentials;
    private _csrfToken?: string;

    constructor() {
        super();
        this._request = axios.create({ withCredentials: true });
        this._request.interceptors.request.use(this._handleRequest);
        this._request.interceptors.response.use(this._handleResponse);
        axiosRetry(this._request, { retries: 3 });
    }

    private _handleRequest = async (config: AxiosRequestConfig) => {
        if (config.url && config.url.includes("/glagol/")) return this._handleRequestGlagol(config);
        if (!this._credentials) return config;

        // Получение новых куки
        if (!this._credentials.cookies) {
            const cookies = await this.getCookies(this._credentials.token);
            this.setCredentials({ ...this._credentials, cookies });
        }
        config.headers = { ...config.headers, "Cookie": this._credentials.cookies! };

        // Получение нового CSRF-токена
        if (config.method && config.method !== "get") {
            if (!this._csrfToken) {
                const csrfToken = await this.getCsrfToken();
                this._csrfToken = csrfToken;
            }
            config.headers = { ...config.headers, "x-csrf-token": this._csrfToken };
        }

        return config;
    }

    private _handleRequestGlagol = async (config: AxiosRequestConfig) => {
        if (!this._credentials) return config;

        // Получение нового музыкального токена
        if (!this._credentials.musicToken) {
            const musicToken = await this.getMusicToken(this._credentials.token);
            this.setCredentials({ ...this._credentials, musicToken });
        }
        config.headers = { ...config.headers, "Authorization": `Oauth ${this._credentials.musicToken}` };

        return config;
    };

    private _handleResponse = async (res: AxiosResponse) => {
        if (res.config.url && res.config.url.includes("/glagol/")) return this._handleResponseGlagol(res);
        if (!this._credentials) return res;

        // Сброс куки или CSRF-токена
        if (res.status === 401) this._credentials.cookies = undefined;
        if (res.status === 403) this._csrfToken = undefined;
        return res;
    }

    private _handleResponseGlagol = async (res: AxiosResponse) => {
        if (!this._credentials) return res;
        
        // Сброс музыкального токена
        if (res.status === 403) this._credentials.musicToken = undefined;
        return res;
    }

    get request() {
        return this._request;
    }

    get credentials() {
        return this._credentials;
    }

    setCredentials(credentials: Credentials) {
        this.emit("credentials", credentials);
        this._credentials = credentials;
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

    async getSpeakerToken(platform: string, glagolId: string): Promise<string> {
        const url = "https://quasar.yandex.net/glagol/token";
        const params = {
            platform, device_id: glagolId
        };

        return await this._request.get(url, { params })
            .then(res => res.data.token);
    }

    async getCsrfToken(): Promise<string> {
        const url = "https://yandex.ru/quasar?storage=1";

        return await this._request.get(url)
            .then(res => res.data.storage.csrfToken2);
    }
}

export { API };