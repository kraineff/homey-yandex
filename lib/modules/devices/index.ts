import Yandex from "../../yandex";
import YandexDiscovery from "./discovery";
import YandexDevice from "./types/device";
import YandexSpeaker from "./types/speaker";

import { updatedDiff } from "deep-object-diff";
import { DeviceData } from "./types";

type Device = YandexSpeaker | YandexDevice;
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
    private data: DeviceData[];
    private initialized: Device[];
    devices: Device[];
    discovery: YandexDiscovery;

    getById(id: string) {
        return this.devices.find(device => device.id === id);
    }

    getByType = (type: DeviceType) => {
        return this.devices.filter(device => DEVICES_TYPES[type].some(type => device.data.type.includes(type)));
    }

    getByPlatform = (platform: string) => {
        return (<YandexSpeaker[]>this.getByType("speaker")).filter(device => device.data.settings.quasar_info.platform === platform);
    }

    getByYandexType = (type: string) => {
        return this.devices.filter(device => device.data.type.includes(type));
    }

    constructor(yandex: Yandex) {
        this.yandex = yandex;
        this.discovery = new YandexDiscovery(yandex);
        this.devices = [];
        this.data = [];
        this.initialized = [];
    }

    async init() {
        await this.discovery.init();

        await this.yandex.session.get("https://iot.quasar.yandex.ru/m/v3/user/devices")
            .then(resp => this.update([].concat.apply([], (<any[]>resp.data.households).map(({ all }) => all))))
            .catch(err => { throw err });

        this.initialized.forEach(async device => await device.setAvailable());
    }

    async close() {
        await this.discovery.close();

        this.initialized.forEach(async device => await device.setUnavailable("NO_AUTH"));
    }

    async initDevice(id: string) {
        const device = <YandexDevice>this.getById(id);
        if (device) this.initialized.push(device);
        return device || new YandexDevice(this.yandex, id);
    }

    async initSpeaker(id: string) {
        const device = <YandexSpeaker>this.getById(id);
        if (device) this.initialized.push(device);
        return device || new YandexSpeaker(this.yandex, id);
    }

    private async getFullDevices(rawDevices: any[]) {
        return Promise.all(rawDevices.map(async rawDevice => {
            return Promise.all([
                this.yandex.session.get(`https://iot.quasar.yandex.ru/m/user/devices/${rawDevice.id}`)
                    .then(resp => resp.data),
                this.yandex.session.get(`https://iot.quasar.yandex.ru/m/v2/user/devices/${rawDevice.id}/configuration`)
                    .then(resp => resp.data)
            ]).then(data => {
                const device = data[0], config = data[1];

                ["status", "request_id", "updates_url", "names", "groups", "room", "skill_id", "external_id", "favorite", "quasar_info"]
                    .forEach(key => delete device[key]);

                ["status", "request_id", "id", "name", "original_type"]
                    .forEach(key => delete config[key]);

                return { ...device, settings: config, created: rawDevice.created };
            }).catch(err => { throw err });
        }));
    }

    async update(data: any[]) {
        if (!data.length) return;
        data = await this.getFullDevices(data);

        const newIds = data.map(item => item.id);
        this.devices.filter(async device => {
            if (newIds.includes(device.id)) return true;

            this.initialized.filter(_device => _device.id !== device.id);
            await device.setUnavailable("REMOVED");
            return false;
        });

        const currentIds = this.data.map(item => item.id);
        data.forEach(async item => {
            const device = currentIds.includes(item.id) ?
                this.getById(item.id)! :
                item.type.startsWith("devices.types.smart_speaker") ?
                    new YandexSpeaker(this.yandex, item.id) :
                    new YandexDevice(this.yandex, item.id);
                
            if (!currentIds.includes(item.id)) this.devices.push(device);
            const difference = updatedDiff(device.data, item);
            if (Object.keys(difference).length) await device.update(item);
        });

        this.data = data;
    }
}