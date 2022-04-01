import Yandex from "../../../yandex";
import EventEmitter from "events";
import { DeviceData } from "../types";

export default class YandexDeviceBase extends EventEmitter {
    yandex: Yandex;

    id: string
    data!: DeviceData;

    constructor (yandex: Yandex, id: string) {
        super();
        this.yandex = yandex;
        this.id = id;

        this.on("newListener", async (event, listener) => {
            if (event === "available" && this.yandex.ready && this.data) process.nextTick(() => this.setAvailable());
            if (event === "unavailable" && this.yandex.ready && !this.data) listener("REMOVED");
            if (event === "unavailable" && !this.yandex.ready) listener("NO_AUTH");
        });
    }

    async setAvailable() {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Инициализация устройства`);
        
        this.emit("available");
    }

    async setUnavailable(reason: "NO_AUTH" | "REMOVED" | "CLOSED" = "CLOSED") {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Завершение устройства -> ${reason}`);
        
        this.emit("unavailable", reason);

        if (reason === "CLOSED" || reason === "REMOVED") {
            this.removeAllListeners("available");
            this.removeAllListeners("unavailable");
            this.removeAllListeners("state");
            this.removeAllListeners("update");
        }
    }

    async update(data: DeviceData) {
        this.data = data;
        this.emit("update", this.data);
    }

    async delete() {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Удаление устройства`);

        return this.yandex.session.options({
            url: `https://iot.quasar.yandex.ru/m/user/devices/${this.id}`,
            method: "DELETE"
        });
    }

    async editRoom(roomId: string) {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Изменение комнаты`);
        
        return this.yandex.session.put(`https://iot.quasar.yandex.ru/m/user/devices/${this.id}/room`, {
            data: { room: roomId }
        });
    }

    async editName(oldName: string, newName: string) {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Изменение имени -> ${oldName}`);
        
        return this.yandex.session.options({
            url: `https://iot.quasar.yandex.ru/m/user/devices/${this.id}/name`,
            method: "PUT",
            data: { old_name: oldName, new_name: newName }
        });
    }

    async addName(name: string) {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Добавление имени -> ${name}`);
        
        return this.yandex.session.options({
            url: `https://iot.quasar.yandex.ru/m/user/devices/${this.id}/name`,
            method: "POST",
            data: { name }
        });
    }

    async removeName(name: string) {
        if (this.yandex.options?.debug)
            console.log(`[Устройство: ${this.id}] -> Удаление имени -> ${name}`);
        
        return this.yandex.session.options({
            url: `https://iot.quasar.yandex.ru/m/user/devices/${this.id}/name`,
            method: "POST",
            data: { name }
        });
    }
}