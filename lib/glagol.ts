import { YandexLocalDevice } from "../types";
import YandexSession from "./session";
import { client, connection } from "websocket";
import { v4 } from "uuid";
import { RequestOptions } from "https";
import EventEmitter from "events";

export default class YandexGlagol extends EventEmitter {
    session: YandexSession;
    device!: YandexLocalDevice;

    connection?: connection;
    client!: client;
    local_token: string = "";

    constructor(session: YandexSession) {
        super();
        this.session = session;
    }
    
    async reConnect(device: YandexLocalDevice) {
        console.log(`[Glagol: ${device.id}] -> Проверка подключения`);

        this.device = device;
        if (!this.local_token) await this.getToken();

        await this.close();
        await this.connect();
    }

    async connect() {
        console.log(`[Glagol: ${this.device.id}] -> Подключение к WebSocket`);

        this.client = new client();

        this.client.on("connect", async (connection: connection) => {
            this.connection = connection;
            
            await this.send({ command: "softwareVersion" });

            this.connection.on("message", message => {
                if (message.type === "utf8") {
                    let response = JSON.parse(message.utf8Data);
                    this.emit(this.device.id, response);
                }
            });

            this.connection.on("error", async (error) => {
                await this.reConnect(this.device);
            });
        });

        this.client.on("connectFailed", error => {
            console.log(`Ошибка подключения к WebSocket: ${error.message}`);
        });

        this.client.connect(`wss://${this.device.host}:${this.device.port}`, undefined, undefined, undefined, <RequestOptions>{ rejectUnauthorized: false });
    }

    async close() {
        if (this.connection?.connected) {
            console.log(`[Glagol: ${this.device.id}] -> Отключение от WebSocket`);

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
                device_id: this.device.quasar_info.device_id,
                platform: this.device.quasar_info.platform
            }
        });

        if (response.status !== "ok") throw response;
        this.local_token = response.token;
    }
}