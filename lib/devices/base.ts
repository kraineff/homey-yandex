import Yandex from "../yandex";
import EventEmitter from "events";
import { RawDevice } from "../modules/devices";

export default class YandexDeviceBase extends EventEmitter {
    yandex: Yandex;
    id: string
    initialized: boolean;
    raw!: RawDevice;

    constructor (yandex: Yandex, id: string) {
        super();
        this.yandex = yandex;
        this.id = id;
        this.initialized = false;

        this.on("raw_update", (raw: RawDevice) => this.raw = raw);
    }

    async init() {
        console.log(`[Устройство: ${this.raw.id}] -> Инициализация устройства`);

        this.emit("available");
        this.initialized = true;
    }

    async destroy() {
        console.log(`[Устройство: ${this.raw.id}] -> Завершение устройства`);

        this.emit("unavailable");
        this.initialized = false;

        this.removeAllListeners("available");
        this.removeAllListeners("unavailable");
        this.removeAllListeners("state");
    }

    async delete() {
        console.log(`[Устройство: ${this.raw.id}] -> Удаление устройства`);

        const url = `https://iot.quasar.yandex.ru/m/user/devices/${this.raw.id}`;
        return this.yandex.options(url, {
            headers: {
                "Access-Control-Request-Method": "DELETE"
            }
        })
        .then(() => this.yandex.delete(url))
        .then(() => this.destroy())
        .then(() => this.yandex.devices.remove(this.id));
    }
}