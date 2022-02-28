import EventEmitter from "events";
import { client, connection } from "websocket";
import { RequestOptions } from "https";
import { v4 } from "uuid";

import YandexSession from "./session";
import { Device } from "./types";

export default class YandexGlagol extends EventEmitter {
    session: YandexSession;
    device!: Device;
    local_token: string = "";

    connection?: connection;
    reconnectTimer?: NodeJS.Timeout;

    constructor(session: YandexSession) {
        super();
        this.session = session;
    }
    
    async init(device: Device) {
        console.log(`[Glagol: ${device.id}] -> Инициализация глагола`);

        this.device = device;
        if (!this.local_token) await this.getToken();

        await this.close();
        await this.connect();
    }

    async reConnect() {
        console.log(`[Glagol: ${this.device.id}] -> Перезапуск получения данных`);

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(async () => {
            await this.init(this.device);
        }, 10000);
    }

    async connect() {
        console.log(`[Glagol: ${this.device.id}] -> Запуск получения данных`);

        const ws = new client();

        ws.on("connect", async (connection: connection) => {
            this.connection = connection;
            
            await this.send({ command: "softwareVersion" });

            this.connection.on("message", message => {
                if (message.type === "utf8") {
                    let response = JSON.parse(message.utf8Data);
                    this.emit(this.device.id, response);
                }
            });

            this.connection.on("error", async () => await this.reConnect());
            this.connection.on("close", async () => await this.reConnect());
        });

        ws.on("connectFailed", async () => await this.reConnect());

        ws.connect(`wss://${this.device.local!.address}:${this.device.local!.port}`, undefined, undefined, undefined, <RequestOptions>{ rejectUnauthorized: false });
    }

    async close() {
        if (this.connection?.connected) {
            console.log(`[Glagol: ${this.device.id}] -> Остановка получения данных`);

            this.connection.close();
        }
    }

    async send(payload: any) {
        if (this.connection?.connected) {
            console.log(`[Glagol: ${this.device.id}] -> Выполнение действия -> ${JSON.stringify(payload)}`);

            this.connection.send(JSON.stringify({
                conversationToken: this.local_token,
                payload: payload,
                id: v4(),
                sentTime: Math.floor(new Date().getTime() / 1000)
            }));
        }
    }

    async getToken() {
        console.log(`[Glagol: ${this.device.id}] -> Получение локального токена`);

        let response = await this.session.request({
            method: "GET",
            url: "https://quasar.yandex.net/glagol/token",
            params: {
                device_id: this.device.quasar.id,
                platform: this.device.quasar.platform
            }
        });

        if (response.status !== "ok") throw response;
        this.local_token = response.token;
    }
}