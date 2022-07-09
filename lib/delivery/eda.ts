import EventEmitter from "events";
import { API } from "../api";
import { OrdersInfoOrderResponse, OrdersInfoRefreshResponse, OrdersOrderResponse, OrdersResponse, OrdersTrackingResponse } from "../types/EdaResponses";

export class Eda extends EventEmitter {
    private _api: API;
    private _checkAfter!: number;

    constructor(api: API) {
        super();
        this._api = api;
    }

    async startTracking() {
        const run = async () => {
            if (this._checkAfter === 0) return;

            const orders = await this.getTrackingOrders();
            if (orders.payload.trackedOrders.length) this.emit("refresh", orders);
            this._checkAfter = orders.meta.count === 0 ? 60 : orders.meta.checkAfter;

            setTimeout(run, this._checkAfter * 1000);
        };

        this._checkAfter = 60;
        await run();
    }

    async stopTracking() {
        this._checkAfter = 0;
    }

    async getOrderInfo(orderId: string): Promise<OrdersInfoOrderResponse> {
        const url = `https://eda.yandex.ru/eats/v1/orders-info/v1/order?order_nr=${orderId}`;
        return await this._api.request.get(url).then(res => res.data);
    }

    async refreshOrders(orders: []): Promise<OrdersInfoRefreshResponse> {
        const url = "https://eda.yandex.ru/eats/v1/orders-info/v1/refresh-orders";
        return await this._api.request.post(url, {
            order_nrs: orders,
            goods_items_limit: 6
        }).then(res => res.data);
    }

    async getOrders(): Promise<OrdersResponse> {
        const url = "https://eda.yandex.ru/api/v1/orders";
        return await this._api.request.get(url).then(res => res.data);
    }

    async getOrder(orderId: string): Promise<OrdersOrderResponse> {
        const url = `https://eda.yandex.ru/api/v1/orders/${orderId}`;
        return await this._api.request.get(url).then(res => res.data);
    }

    async getTrackingOrders(): Promise<OrdersTrackingResponse> {
        const url = "https://eda.yandex.ru/api/v2/orders/tracking";
        return await this._api.request.get(url).then(res => res.data);
    }
}