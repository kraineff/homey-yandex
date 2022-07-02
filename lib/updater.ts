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

        await this._api.request.get(url).then(({ data }) => {
            if (data.status !== "ok") return;
            this._updatesUrl = data.updates_url;
            const devices = data.households.map((household: any) => household.all);
            this._devices = [].concat.apply([], devices);
        });
    }

    // Начать получение обновлений устройств
    private _startUpdates() {
        if (this._updatesSocket) this._updatesSocket.terminate();

        const heartbeat = () => {
            if (this._updatesTimeout) clearTimeout(this._updatesTimeout);

            this._updatesTimeout = setTimeout(() => {
                this._updatesSocket!.terminate();
            }, 60000 + 1000);
        };

        this._updatesSocket = new WebSocket(this._updatesUrl);
        this._updatesSocket.addEventListener("open", async () => heartbeat());
        this._updatesSocket.on("ping", () => heartbeat());
        this._updatesSocket.addEventListener("message", event => {
            heartbeat();
            const data = JSON.parse(event.data.toString());
            if (!data.message) return;
            const message = JSON.parse(data.message);
            
            if (data.operation === "update_device_list") {
                const data: {
                    households: any[],
                    favorites: {
                        properties: any[],
                        items: any[],
                        background_image: {
                            id: string
                        }
                    }
                    source: "discovery" | "delete_device" | "update_device" | "update_room"
                } = message;
            }

            if (data.operation === "update_scenario_list") {
                const data: {
                    scenarios: any[],
                    scheduled_scenarios: any[],
                    source: "create_scenario" | "delete_scenario" | "create_scenario_launch" | "update_scenario_launch"
                } = message;
            }

            if (data.operation === "update_states") {
                const data: {
                    updated_devices: any[],
                    update_groups: any[],
                    source: "query" | "action" | "callback"
                } = message;
                
                if (data.source === "action")
                    data.updated_devices.forEach(device => this.emit("state", device));
            }
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
        if (!id) return;
        this._localSpeakers[id] = data;
        this.emit("localSpeaker", { [id]: data });
    }

    // Пропала колонка из локальной сети
    private _goneLocalSpeaker = (service: Service) => {
        if (!("addresses" in service && service.addresses?.length && "txt" in service)) return;
        delete this._localSpeakers[service.txt.deviceId];
    }

    private _getSpeakerIdByDeviceId(deviceId: string) {
        const speaker = this._devices.find(device => device.quasar_info?.device_id === deviceId);
        return speaker ? speaker.id : undefined;
    }

    // Получение данных о локальных колонках
    private async _getLocalSpeakers() {
        const url = "https://quasar.yandex.ru/glagol/device_list";

        await this._api.request.get(url).then(async ({ data }) => {
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
                if (!id) return;
                this._localSpeakers[id] = data;
                this.emit("localSpeaker", { [id]: data });
            });
        });
    }
}

export { Updater };