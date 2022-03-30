import Yandex from "../../yandex";
import YandexDiscovery from "./discovery";
import YandexDevice from "./types/device";
import YandexSpeaker from "./types/speaker";

import { Device } from "./types";

type DeviceType = "speaker" | "remote" | "socket" | "light" | "kettle" | "vacuumcleaner" | "humidifier" | "thermostat";

export const DEVICES_TYPES = {
    "speaker": ["devices.types.smart_speaker"],
    "remote": ["devices.types.other"],
    "socket": ["devices.types.switch", "devices.types.socket"],
    "light": ["devices.types.light"],
    "kettle": ["devices.types.cooking.kettle"],
    "vacuumcleaner": ["devices.types.vacuum_cleaner"],
    "humidifier": ["devices.types.humidifier"],
    "thermostat": ["devices.types.thermostat"]
}

export default class YandexDevices {
    private yandex: Yandex;
    devices: Device[];
    discovery: YandexDiscovery;

    getById(id: string) {
        return this.devices.find(device => device.id === id);
    }

    getByType = (type: DeviceType) => {
        return this.devices.filter(device => DEVICES_TYPES[type].some(type => device.raw.type.includes(type)));
    }

    getByPlatform = (platform: string) => {
        return this.devices.filter(device => device.raw.quasar_info?.platform === platform);
    }

    getByYandexType = (type: string) => {
        return this.devices.filter(device => device.raw.type.includes(type));
    }

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this.discovery = new YandexDiscovery(yandex);
        this.devices = [];
    }

    async init() {
        await this.discovery.init();
        await this.update();

        this.devices.forEach(async device => {
            if (device.initialized) await device.setAvailable();
        });
    }

    async close() {
        await this.discovery.close();

        this.devices.forEach(async device => {
            if (device.initialized) await device.setUnavailable("NO_AUTH");
        });
    }

    async initDevice(id: string) {
        const check = <YandexDevice>this.getById(id);
        const device = check || new YandexDevice(this.yandex, id);
        device.initialized = true;

        if (!check) this.devices.push(device);
        return device;
    }

    async initSpeaker(id: string) {
        const check = <YandexSpeaker>this.getById(id);
        const device = check || new YandexSpeaker(this.yandex, id);
        device.initialized = true;

        if (!check) this.devices.push(device);
        return device;
    }

    async update() {
        if (this.yandex.options?.debug)
            console.log("[Устройства] -> Обновление устройств");
        
        const ids = await this.yandex.session.get("https://iot.quasar.yandex.ru/m/user/devices").then(resp => {
            //@ts-ignore
            return [...[].concat.apply([], resp.data.rooms.map(({ devices }) => devices)), ...resp.data.speakers, ...resp.data.unconfigured_devices]
                .map(device => device.id);
        });

        const rawDevices = await Promise.all(ids.map(async id => {
            return this.yandex.session.get(`https://iot.quasar.yandex.ru/m/user/devices/${id}`).then(resp => {
                const rawDevice = resp.data;
                delete rawDevice.request_id;
                delete rawDevice.updates_url;
                delete rawDevice.status;
                return rawDevice;
            });
        }));

        const currentIds = this.devices.map(device => device.id);
        rawDevices.forEach(async rawDevice => {
            if (!currentIds.includes(rawDevice.id)) {
                const device = (rawDevice.type.startsWith("devices.types.smart_speaker")) ?
                    new YandexSpeaker(this.yandex, rawDevice.id) :
                    new YandexDevice(this.yandex, rawDevice.id);
                this.devices.push(device);
            }

            const device = this.getById(rawDevice.id)!;
            await device.update(rawDevice);
        });

        const newIds = rawDevices!.map(rawDevice => rawDevice.id);
        this.devices.filter(async device => {
            if (newIds.includes(device.id)) return true;
            await device.setUnavailable("REMOVED");
            return false;
        });
    }
}