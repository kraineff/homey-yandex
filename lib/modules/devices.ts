import Yandex from "../yandex";
import YandexSpeaker from "../devices/speaker";
import YandexDevice from "../devices/device";

type Device = YandexSpeaker | YandexDevice;

export type RawDevice = {
    id: string
    name: string
    names: string[]
    type: string
    icon_url: string
    state: string
    groups: any[]
    room: string
    capabilities: any[]
    properties: any[]
    skill_id: string
    external_id: string
    render_info?: {
        icon: {
            id: string
        }
    }
    quasar_info?: {
        device_id: string
        platform: string
        multiroom_available: boolean
        multistep_scenarios_available: boolean
        device_discovery_methods: any[]
    }
    favorite: boolean
}

export default class YandexDevices {
    yandex: Yandex;
    private _devices: Device[];

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this._devices = [];
    }

    speakers = (): YandexSpeaker[] => this._devices.filter((device): device is YandexSpeaker => device.raw.type.startsWith("devices.types.smart_speaker"));
    remotes = (): YandexDevice[] => this._devices.filter((device): device is YandexDevice => device.raw.type === "devices.types.other");
    switches = (): YandexDevice[] => this._devices.filter((device): device is YandexDevice => ["devices.types.switch", "devices.types.socket"].includes(device.raw.type));

    get() {
        return this._devices;
    }

    getById(id: string) {
        return this._devices.find(device => device.id === id);
    } 

    add(device: Device) {
        const found = this.getById(device.id);
        if (!found) this._devices.push(device);
    }

    remove(id: string) {
        this._devices.filter(device => device.id !== id);
    }

    async refresh() {
        console.log("[Устройства] Обновление устройств");

        return this.yandex.get("https://iot.quasar.yandex.ru/m/user/devices").then(async resp => {
            const { rooms, speakers, unconfigured_devices }: { rooms: any[], speakers: any[], unconfigured_devices: any[] } = resp.data;

            await Promise.all(
                [...[].concat.apply([], rooms.map(({ devices }) => devices)), ...speakers, ...unconfigured_devices].map(async device => {
                    return this.yandex.get(`https://iot.quasar.yandex.ru/m/user/devices/${device.id}`).then(resp => resp.data);
                })
            ).then(data => {
                data.forEach((raw: RawDevice) => {
                    if (raw.type.startsWith("devices.types.smart_speaker")) this.add(new YandexSpeaker(this.yandex, raw.id));
                    else this.add(new YandexDevice(this.yandex, raw.id));
                    this.getById(raw.id)!.emit("raw_update", raw);
                });
            });
        });
    }
}