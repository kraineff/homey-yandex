import axios, { AxiosInstance } from "axios";
import { YandexStorage } from "../../storage/index.js";
import { YandexPassportAPI } from "./passport.js";
import { createInstance } from "../utils.js";

export class YandexIotAPI {
    private client: AxiosInstance;
    #csrfToken?: string;

    constructor(storage: YandexStorage, private passport: YandexPassportAPI) {
        this.client = createInstance(storage, config => ({
            ...config,
            headers: {
                ...config.headers,
                "Accept": "*/*",
                "Origin": "https://yandex.ru",
                "Referer": "https://yandex.ru/"
            }
        }));

        this.client.interceptors.request.use(async request => {
            if (request.method === "get" && request.url?.includes("/glagol/"))
                request.headers.set("Authorization", `OAuth ${ await this.passport.getMusicToken() }`);

            if (["post", "put", "delete"].includes(request.method || ""))
                request.headers.set("x-csrf-token", await this.#getCsrfToken());

            return request;
        });

        this.client.interceptors.response.use(undefined, async error => {
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                this.#csrfToken = undefined;
                if (error.config) return await this.client.request(error.config);
            }
            
            throw error;
        });
    }

    get request() {
        return this.client;
    }

    async #getCsrfToken() {
        if (this.#csrfToken) return this.#csrfToken;
        return await this.client
            .get("https://quasar.yandex.ru/csrf_token")
            .then(res => this.#csrfToken = res.data.token as string);
    }

    async getGlagolToken(deviceId: string, platform: string) {
        const params = { device_id: deviceId, platform };

        return await this.client
            .get("https://quasar.yandex.ru/glagol/token", { params })
            .then(res => res.data.token as string);
    }

    async getGlagolDevices() {
        return await this.client
            .get("https://quasar.yandex.ru/glagol/device_list")
            .then(res => res.data.devices);
    }

    async getDevices() {
        return await this.client
            .get("https://iot.quasar.yandex.ru/m/v3/user/devices")
            .then(res => res.data as any);
    }

    async getAudioDevices() {
        return await this.client
            .get("https://iot.quasar.yandex.ru/glagol/user/info?scope=audio")
            .then(res => res.data.devices);
    }

    async runDeviceAction(id: string, actions: any[]) {
        return await this.client
            .post(`https://iot.quasar.yandex.ru/m/user/devices/${id}/actions`, { actions })
            .then(() => {});
    }

    async getScenarios() {
        return await this.client
            .get("https://iot.quasar.yandex.ru/m/user/scenarios")
            .then(res => res.data.scenarios);
    }

    async getScenarioIcons() {
        return await this.client
            .get("https://iot.quasar.yandex.ru/m/user/scenarios/icons")
            .then(res => res.data);
    }

    async editScenario(scenarioId: string, data: any) {
        await this.client
            .put(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}`, data);
    }

    async createScenario(data: any) {
        // status: 'ok',
        // request_id: '9c465ddd-5e8d-4909-a14b-1f5d55c9e484',
        // scenario_id: '5cc7b99c-5a55-434a-a6f3-554064d318db'
        return await this.client
            .post("https://iot.quasar.yandex.ru/m/v3/user/scenarios", data)
            .then(res => {
                const status = res.data.status;
                if (status !== 'ok') throw new Error(res.data.message ?? res.data.code);
                return res.data;
            });
    }

    async runScenarioAction(scenarioId: string) {
        await this.client
            .post(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}/actions`);
    }
}