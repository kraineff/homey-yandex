import Homey, { DiscoveryStrategy } from 'homey';

import Yandex from './yandex';

export const classNames: any = {
    "speaker": "speakers",
    "light": "lights",
    "socket": "switches",
    "thermostat": "thermostats",
    "vacuumcleaner": "vacuums",
    "heater": "heaters",
    "remote": "remotes"
};

export interface YandexApp extends Homey.App {
    yandex: Yandex;
    discoveryStrategy: DiscoveryStrategy;
}

export interface DeviceTypes {
    speakers?: Device[];
    lights?: Device[];
    switches?: Device[];
    thermostats?: Device[];
    vacuums?: Device[];
    heaters?: Device[];
    remotes?: Device[];
}

export type Scenario = {
    id: string
    name: string
    icon: string
    trigger: string
    action: {
        type: string
        value: string
    }
    device_id?: string
}

export type Device = {
    id: string
    name: string
    type: string
    icon_url: string
    capabilities?: any[]
    properties?: any[]
    quasar_info?: {
        device_id: string,
        platform: string
        multiroom_available: boolean
        multistep_scenarios_available: boolean
        device_discovery_methods: any[]
    }
    item_type: string
    groups: any[]
}