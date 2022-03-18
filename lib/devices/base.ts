import Yandex from "../yandex";
import EventEmitter from "events";

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

export interface SimpleDevice {
    yandex: Yandex
    initialized: boolean
    raw: any

    init(): Promise<void>
    destroy(): Promise<void>
    emit(eventName: string | symbol, ...args: any[]): boolean
}

export default class BaseDevice extends EventEmitter implements SimpleDevice {
    yandex: Yandex;
    initialized: boolean;
    raw!: any;

    constructor (yandex: Yandex) {
        super();
        this.yandex = yandex;
        this.initialized = false;

        this.on("raw_update", (raw: RawDevice) => this.raw = raw);
    }

    async init() {
        console.log(`[Устройство: ${this.raw.id}] -> Инициализация устройства`);

        this.emit("available");
        this.initialized = true;
    }

    async destroy() {
        console.log(`[Устройство: ${this.raw.id}] -> Удаление устройства`);

        this.emit("unavailable");
        this.initialized = false;

        this.removeAllListeners("available");
        this.removeAllListeners("unavailable");
        this.removeAllListeners("state");
    }
}