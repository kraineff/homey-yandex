import { AxiosInstance } from "axios";
import { createInstance } from "../utils.js";
import { YandexStorage } from "../../storage/index.js";
import { YandexPassportAPI } from "./passport.js";
import { createHmac } from "crypto";
import qs from "querystring";

export class YandexMusicAPI {
    private client: AxiosInstance;

    constructor(storage: YandexStorage, private passport: YandexPassportAPI) {
        this.client = createInstance(storage, config => ({
            ...config,
            headers: {
                ...config.headers,
                "X-Yandex-Music-Client": "YandexMusicAndroid/24023621",
                "X-Yandex-Music-Content-Type": "adult"
            }
        }));

        this.client.interceptors.request.use(async request => {
            request.headers.set("Authorization", `OAuth ${ await this.passport.getMusicToken() }`);
            return request;
        });
    }

    get request() {
        return this.client;
    }

    async getTrack(trackId: string) {
        return await this.client
            .post("https://api.music.yandex.net/tracks", qs.stringify({ "track-ids": [trackId] }))
            .then(res => res.data.result[0]);
    }

    async getLyrics(trackId: string) {
        const timestamp = Math.round(Date.now() / 1000);
        const hmac = createHmac("sha256", "p93jhgh689SBReK6ghtw62")
            .update(`${trackId}${timestamp}`)
            .digest();
        
        const params = { timeStamp: timestamp, sign: hmac.toString("base64") };
        const lyricsUrl = await this.client
            .get(`https://api.music.yandex.net/tracks/${trackId}/lyrics`, { params })
            .then(res => res.data.result.downloadUrl);

        return await this.client
            .get(lyricsUrl)
            .then(res => res.data);
    }
}