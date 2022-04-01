import EventEmitter from "events";
import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from 'ws';
import Yandex from "../yandex";

class UpdatesWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            perMessageDeflate: false
        });
    }
}

export default class YandexUpdates extends EventEmitter {
    private yandex: Yandex;
    private socket?: ReconnectingWebSocket;

    constructor(yandex: Yandex) {
        super();
        this.yandex = yandex;
    }

    async init() {
        if (this.yandex.options?.debug)
            console.log("[Обновления] -> Инициализация обновлений");
        
        if (this.socket) return;
        this.socket = new ReconnectingWebSocket(this.url, [], { WebSocket: UpdatesWebSocket });
        //@ts-ignore
        this.socket.addEventListener("message", this.handleMessage);
    }

    async close() {
        if (this.yandex.options?.debug)
            console.log("[Обновления] -> Завершение обновлений");
        
        if (!this.socket) return;
        this.socket.close();
        //@ts-ignore
        this.socket.removeEventListener("message", this.handleMessage);
    }

    private url = async (): Promise<string> => {
        return this.yandex.session.get("https://iot.quasar.yandex.ru/m/v3/user/devices")
            .then(resp => resp.data.updates_url)
            .catch(() => "");
    }

    private handleMessage = async (event: any) => {
        const data = JSON.parse(event.data);
        if (!data.message) return;
        
        const message = JSON.parse(data.message);

        if (data.operation === "update_device_list") {
            const source: "discovery" | "delete_device" | "update_device" = message.source;
            //@ts-ignore
            await this.yandex.devices.update([].concat.apply([], message.households.map(({ all }) => all)));
        }

        if (data.operation === "update_scenario_list") {
            const source: "create_scenario" | "delete_scenario" | "create_scenario_launch" | "update_scenario_launch" = message.source;
            if (source === "create_scenario" || source === "delete_scenario") await this.yandex.scenarios.update();
        }

        if (data.operation === "update_states") {
            const source: "query" | "action" | "callback" = message.source;
            if (source === "action") message.updated_devices.forEach((state: any) => this.emit("device_state", state));
        }
    }
}