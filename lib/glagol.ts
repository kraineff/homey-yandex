import EventEmitter from "events";
import { v4 } from "uuid";
import ReconnectingWebSocket from "reconnecting-websocket";
import WebSocket from 'ws';

import { Speaker } from "./types";
import Yandex from "./yandex";

class GlagolWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols, {
            rejectUnauthorized: false
        });
    }
}

export default class YandexGlagol extends EventEmitter {
    yandex: Yandex;
    speaker!: Speaker;
    local_token: string = "";
    rws!: ReconnectingWebSocket;

    constructor(yandex: Yandex) {
        super();
        this.yandex = yandex;
    }
    
    async init(speaker: Speaker, url: () => string) {
        console.log(`[Glagol: ${speaker.id}] -> Инициализация глагола`);

        this.speaker = speaker;
        if (!this.local_token) await this.getToken();

        await this.connect(url);
    }

    async connect(url: () => string) {
        this.rws = new ReconnectingWebSocket(url, [], { WebSocket: GlagolWebSocket });
        this.rws.addEventListener("open", () => this.send({ command: "softwareVersion" }));
        this.rws.addEventListener("message", event => {
            const data = JSON.parse(event.data);
            if (data) this.emit(this.speaker.id, data);
        });
    }

    close() {
        console.log(`[Glagol: ${this.speaker.id}] -> Остановка получения данных`);
        if (this.rws) this.rws.close();
    }

    send(payload: any) {
        console.log(`[Glagol: ${this.speaker.id}] -> Выполнение действия -> ${JSON.stringify(payload)}`);

        this.rws.send(JSON.stringify({
            conversationToken: this.local_token,
            payload: payload,
            id: v4(),
            sentTime: Math.floor(new Date().getTime() / 1000)
        }));
    }

    async getToken() {
        console.log(`[Glagol: ${this.speaker.id}] -> Получение локального токена`);

        return this.yandex.get("https://quasar.yandex.net/glagol/token", {
            params: {
                device_id: this.speaker.quasar.id,
                platform: this.speaker.quasar.platform
            }
        }).then(resp => {
            if (resp.data?.status !== "ok") throw new Error();
            this.local_token = resp.data.token;
        });
    }
}