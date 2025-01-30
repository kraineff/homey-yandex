import http from "http";
import https from "https";
import axios, { AxiosInstance, CreateAxiosDefaults } from "axios";
import { YandexStorage } from "../storage.js";

interface YandexAxiosInstance extends AxiosInstance {
    lastRequest: number;
}

export const createInstance = (storage: YandexStorage, configCallback: (config: CreateAxiosDefaults) => CreateAxiosDefaults) => {   
    const client = axios.create(configCallback({
        withCredentials: true,
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true }),
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15",
            "Accept": "*/*",
            "Accept-Language": "ru",
            "Accept-Encoding": "gzip, deflate, br"
        }
    })) as YandexAxiosInstance;

    client.lastRequest = Date.now();

    client.interceptors.request.use(async config => {
        const delay = client.lastRequest + 200 - Date.now();
        delay > 0 && await new Promise(resolve => setTimeout(resolve, delay));
        client.lastRequest = Date.now();

        const cookies = await storage.getCookies(config.url || "");
        (cookies) && config.headers.set("Cookie", cookies);
        return config;
    });

    client.interceptors.response.use(
        async response => {
            const url = response.config.url;
            const cookies = response.headers["set-cookie"];
            (url && cookies) && await storage.setCookies(url, cookies);
            return response;
        },
        async error => {
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                await storage.removeCookies();
                throw new Error("Требуется повторная авторизация");
            }
            throw error;
        }
    );

    return client;
};