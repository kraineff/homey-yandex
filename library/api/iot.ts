import { YandexAPI } from './index';
import { YandexPassportAPI } from './passport';

export class YandexIotAPI {
    #csrfToken?: string;

    constructor(private api: YandexAPI, private passport: YandexPassportAPI) {
        this.api.request.interceptors.request.use(async config => {
            const { url, method, headers } = config;
            const isQuasar = ['quasar.yandex.ru', 'iot.quasar.yandex.ru'].find(x => (url ?? '').includes(x));

            if (isQuasar && method) {
                headers.set('Accept', '*/*');
                headers.set('Origin', 'https://yandex.ru');
                headers.set('Referer', 'https://yandex.ru/');

                ['post', 'put', 'delete'].includes(method) &&
                    headers.set('x-csrf-token', await this.#getCsrfToken());
            }
            return config;
        });
    }

    async #getCsrfToken() {
        if (this.#csrfToken) return this.#csrfToken;

        return await this.api.request
            .get('https://quasar.yandex.ru/csrf_token')
            .then(res => this.#csrfToken = res.data.token as string);
    }

    async getGlagolToken(deviceId: string, platform: string) {
        const token = await this.passport.getMusicToken();
        const params = { device_id: deviceId, platform };
        const headers = { Authorization: 'OAuth ' + token };

        return await this.api.request
            .get('https://quasar.yandex.ru/glagol/token', { params, headers })
            .then(res => res.data.token as string);
    }

    async getGlagolDevices() {
        return await this.api.request
            .get('https://quasar.yandex.ru/glagol/device_list')
            .then(res => res.data.devices);
    }

    async getDevices() {
        return await this.api.request
            .get('https://iot.quasar.yandex.ru/m/v3/user/devices')
            .then(res => res.data as any);
    }

    async runDeviceAction(id: string, actions: any[]) {
        return await this.api.request
            .post(`https://iot.quasar.yandex.ru/m/user/devices/${id}/actions`, { actions })
            .then(() => {});
    }

    async getScenarios() {
        return await this.api.request
            .get('https://iot.quasar.yandex.ru/m/user/scenarios')
            .then(res => res.data.scenarios);
    }

    async getScenarioIcons() {
        return await this.api.request
            .get('https://iot.quasar.yandex.ru/m/user/scenarios/icons')
            .then(res => res.data);
    }

    async editScenario(scenarioId: string, data: any) {
        await this.api.request
            .put(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}`, data);
    }

    async createScenario(data: any) {
        // status: 'ok',
        // request_id: '9c465ddd-5e8d-4909-a14b-1f5d55c9e484',
        // scenario_id: '5cc7b99c-5a55-434a-a6f3-554064d318db'
        return await this.api.request
            .post(`https://iot.quasar.yandex.ru/m/v3/user/scenarios`, data)
            .then(res => {
                const status = res.data.status;
                if (status !== 'ok') throw new Error(res.data.message ?? res.data.code);
                return res.data;
            })
    }

    async runScenarioAction(scenarioId: string) {
        await this.api.request
            .post(`https://iot.quasar.yandex.ru/m/user/scenarios/${scenarioId}/actions`);
    }
}