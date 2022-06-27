import EventEmitter from "events";
import { API } from "./api";
import { Bonjour, Browser, Service } from "bonjour-service";
import WebSocket from "ws";

type LocalSpeakerData = {
    platform: string,
    deviceId: string,
    address: string,
    port: number
}

class Updater extends EventEmitter {
    private _api: API;
    private _devices: any[];

    private _updatesUrl!: string;
    private _updatesSocket?: WebSocket;
    private _updatesTimeout?: NodeJS.Timeout;

    private _localDiscovery!: Browser;
    private _localSpeakers: {
        [x: string]: LocalSpeakerData
    };

    constructor(api: API) {
        super();
        this._api = api;
        this._devices = [];
        this._localSpeakers = {};
        this._init();
    }

    get localSpeakers() {
        return this._localSpeakers;
    }

    get devices() {
        return this._devices;
    }

    private async _init() {
        await this._getDevices().then(async () => await this._getLocalSpeakers()).then(() => {
            this._startLocalDiscovery();
            // this._startUpdates();
        });
    }

    destroy() {
        if (this._updatesSocket) this._updatesSocket.close();
        this._localDiscovery.stop();
        this._localDiscovery.removeListener("up", this._foundLocalSpeaker);
        this._localDiscovery.removeListener("down", this._goneLocalSpeaker);
    }

    // Получение всех устройств
    private async _getDevices() {
        const url = "https://iot.quasar.yandex.ru/m/v3/user/devices";

        await this._api.instance.get(url).then(({ data }) => {
            if (data.status !== "ok") return;
            this._updatesUrl = data.updates_url;
            const devices = data.households.map((household: any) => household.all);
            this._devices = [].concat.apply([], devices);
        });
    }

    // Начать получение обновлений устройств
    private _startUpdates() {
        if (this._updatesSocket) this._updatesSocket.terminate();

        this._updatesSocket = new WebSocket(this._updatesUrl);
        this._updatesSocket.addEventListener("message", event => {
            const data = JSON.parse(event.data.toString());
            const message = data.message;
        });
    }

    // Начать поиск устройств в локальной сети
    private _startLocalDiscovery() {
        const bonjour = new Bonjour();
        this._localDiscovery = bonjour.find({ type: "yandexio" });
        this._localDiscovery.addListener("up", this._foundLocalSpeaker);
        this._localDiscovery.addListener("down", this._goneLocalSpeaker);
        this._localDiscovery.start();
    }

    // Найдена колонка в локальной сети
    private _foundLocalSpeaker = (service: Service) => {
        if (!this._devices.length) return;
        if (!("addresses" in service && service.addresses?.length && "txt" in service)) return;
        const data: LocalSpeakerData = {
            platform: service.txt.platform, deviceId: service.txt.deviceId,
            address: service.addresses[0], port: service.port
        };
        const id = this._getSpeakerIdByDeviceId(data.deviceId);
        this._localSpeakers[id] = data;
        this.emit("localSpeaker", { [id]: data });
    }

    // Пропала колонка из локальной сети
    private _goneLocalSpeaker = (service: Service) => {
        if (!("addresses" in service && service.addresses?.length && "txt" in service)) return;
        delete this._localSpeakers[service.txt.deviceId];
    }

    private _getSpeakerIdByDeviceId(deviceId: string) {
        return this._devices.find(device => device.quasar_info?.device_id === deviceId)!.id;
    }

    // Получение данных о локальных колонках
    private async _getLocalSpeakers() {
        const url = "https://quasar.yandex.ru/glagol/device_list";

        await this._api.instance.get(url).then(async ({ data }) => {
            if (data.status !== "ok") return;

            const speakers: any[] = data.devices;
            speakers.map(speaker => {
                if (!("networkInfo" in speaker)) return;
                const { ip_addresses, external_port } = speaker.networkInfo;
                if (!(ip_addresses.length && external_port)) return;

                const data: LocalSpeakerData = {
                    platform: speaker.platform, deviceId: speaker.id,
                    address: ip_addresses[0], port: external_port
                };
                const id = this._getSpeakerIdByDeviceId(data.deviceId);
                this._localSpeakers[id] = data;
                this.emit("localSpeaker", { [id]: data });
            });
        });
    }
}

export { Updater };