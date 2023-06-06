import { YandexSession } from '../session';
import { YandexEdaTrackingOrders } from './types';

export class YandexEdaAPI {
    private _session: YandexSession;

    constructor(session: YandexSession) {
        this._session = session;
    }
    
    async getTrackingOrders(): Promise<YandexEdaTrackingOrders> {
        return await this._session.request
            .get('https://eda.yandex.ru/api/v2/orders/tracking')
            .then(res => res.data);
    }
}

export * from './types';