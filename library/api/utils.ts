import http from "node:http";
import https from "node:https";
import axios, { type AxiosInstance, type CreateAxiosDefaults } from "axios";
import type { YandexStorage } from "../storage.js";

interface YandexClient extends AxiosInstance {
	lastRequest: number;
}

export const createInstance = (
	storage: YandexStorage,
	configCallback: (config: CreateAxiosDefaults) => CreateAxiosDefaults,
) => {
	const client = axios.create(
		configCallback({
			withCredentials: true,
			httpAgent: new http.Agent({ keepAlive: true }),
			httpsAgent: new https.Agent({ keepAlive: true }),
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15",
				Accept: "*/*",
				"Accept-Language": "ru",
				"Accept-Encoding": "gzip, deflate, br",
			},
		}),
	) as YandexClient;

	client.lastRequest = Date.now();

	client.interceptors.request.use(async (config) => {
		const delay = client.lastRequest + 200 - Date.now();
		if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
		client.lastRequest = Date.now();

		const address = config.baseURL || config.url || "";
		const cookies = await storage.getCookies(address);
		cookies && config.headers.set("Cookie", cookies);
		return config;
	});

	client.interceptors.response.use(
		async (response) => {
			const address = response.config.baseURL || response.config.url;
			const cookies = response.headers["set-cookie"];
			if (address && cookies) await storage.setCookies(address, cookies);
			return response;
		},
		async (error) => {
			if (axios.isAxiosError(error) && error.response?.status === 401) {
				await storage.removeCookies();
				throw new Error("Требуется повторная авторизация");
			}
			throw error;
		},
	);

	return client;
};
