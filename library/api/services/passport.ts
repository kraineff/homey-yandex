import type { AxiosInstance } from "axios";
import type { YandexStorage } from "../../storage.js";
import qs from "querystring";
import { createInstance } from "../utils.js";

export class YandexPassportAPI {
    private client: AxiosInstance;

    constructor(private storage: YandexStorage) {
        this.client = createInstance(storage, config => config);
    }

    async #getToken(clientId: string, clientSecret: string) {
        return await this.storage
            .getToken(clientId)
            .catch(async () => {
                const cookie = await this.storage.getCookies("https://yandex.ru");
                const headers = { "Ya-Client-Host": "passport.yandex.ru", "Ya-Client-Cookie": cookie };
                const data = qs.stringify({ client_id: clientId, client_secret: clientSecret });
                
                return this.client
                    .post("https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid", data, { headers })
                    .then(res => this.storage.setToken(clientId, res.data));
            });
    }

    async getAccountToken() {
        const cliendId = "c0ebe342af7d48fbbbfcf2d2eedb8f9e";
        const clientSecret = "ad0a908f0aa341a182a37ecd75bc319e";
        return await this.#getToken(cliendId, clientSecret);
    }

    async getMusicToken() {
        const cliendId = "23cabbbdc6cd418abb4b39c32c41195d";
        const clientSecret = "53bc75238f0c4d08a118e51fe9203300";
        return await this.#getToken(cliendId, clientSecret);
    }

    async getMagicAuthorization() {
        const csrf_token = await this.client
            .get("https://passport.yandex.ru/am?app_platform=android")
            .then(res => {
                const match = res.data.match('"csrf_token" value="([^"]+)"');
                if (match === null || match.length <= 1) throw new Error("Нет CSRF-токена");
                return match[1];
            });
        
        const body = qs.stringify({ retpath: "https://passport.yandex.ru/profile", csrf_token, with_code: 1 });

        return await this.client
            .post("https://passport.yandex.ru/registration-validations/auth/password/submit", body)
            .then(res => {
                if (res.data.status !== "ok") throw new Error("Неизвестная ошибка");
                return {
                    auth_url: `https://passport.yandex.ru/am/push/qrsecure?track_id=${res.data.track_id}`,
                    track_id: res.data.track_id,
                    csrf_token: res.data.csrf_token
                };
            });
    }

    async checkMagicAuthorization(payload: any) {
        const { auth_url, ...data } = payload;
        
        return await this.client
            .post("https://passport.yandex.ru/auth/new/magic/status", qs.stringify(data), { maxRedirects: 0 })
            .then(async res => {
                const { status, errors } = res.data;

                if (Object.keys(res.data).length === 0)
                        throw new Error("Ожидание авторизации");

                if (errors) {
                    if (errors.includes("account.auth_passed"))
                        throw new Error("Авторизация уже пройдена");
                    
                    if (errors.includes("track.not_found"))
                        throw new Error("Данные авторизации устарели");
                }

                if (status !== "ok")
                    throw new Error(`Неизвестная ошибка: ${JSON.stringify(res.data)}`);

                await this.getAccountToken();
            });
    }
}