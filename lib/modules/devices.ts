import Yandex from "../yandex";
import YandexSpeaker from "../devices/speaker";
import { RawDevice, SimpleDevice } from "../devices/base";
import YandexDevice from "../devices/device";

export default class YandexDevices {
    yandex: Yandex;

    private _devices: {
        [id: string]: any
    };
    speakers: YandexSpeaker[];
    lights: YandexDevice[];
    switches: YandexDevice[];
    thermostats: YandexDevice[];
    vacuums: YandexDevice[];
    kettles: YandexDevice[];
    remotes: YandexDevice[];
    tvs: YandexDevice[];
    receivers: YandexDevice[];
    hubs: YandexDevice[];

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this._devices = {};
        this.speakers = [];
        this.lights = [];
        this.switches = [];
        this.thermostats = [];
        this.vacuums = [];
        this.kettles = [];
        this.remotes = [];
        this.tvs = [];
        this.receivers = [];
        this.hubs = [];
    }

    get = (): SimpleDevice[] => Object.values(this._devices);
    getById = (id: string) => Object.keys(this._devices).includes(id) ? <SimpleDevice>this._devices[id] : undefined;

    async refresh() {
        console.log("[Устройства] Обновление устройств");

        return this.yandex.get("https://iot.quasar.yandex.ru/m/user/devices").then(async resp => {
            const { rooms, speakers, unconfigured_devices }: { rooms: any[], speakers: any[], unconfigured_devices: any[] } = resp.data;

            await Promise.all(
                [...[].concat.apply([], rooms.map(({ devices }) => devices)), ...speakers, ...unconfigured_devices].map(async device => {
                    return this.yandex.get(`https://iot.quasar.yandex.ru/m/user/devices/${device.id}`).then(resp => resp.data);
                })
            ).then(data => {
                const currentDevices = Object.keys(this._devices);
                data.forEach((raw: RawDevice) => {
                    let device: any;

                    if (!currentDevices.includes(raw.id)) {
                        if (raw.type.startsWith("devices.types.smart_speaker")) {
                            device = new YandexSpeaker(this.yandex);
                            this.speakers.push(device);
                        } else {
                            device = new YandexDevice(this.yandex);
                            if (["devices.types.switch", "devices.types.socket"].includes(raw.type)) this.switches.push(device);
                            if (raw.type === "devices.types.other") this.remotes.push(device);
                        }

                        this._devices[raw.id] = device;
                    } else device = this.getById(raw.id);

                    (<SimpleDevice>device).emit("raw_update", raw);
                });
            });
        });
    }
}