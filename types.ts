import Homey, { DiscoveryStrategy } from 'homey';
import YandexQuasar from './lib/quasar';
import YandexSession from './lib/session';

export interface YandexApp extends Homey.App {
    session: YandexSession;
    quasar: YandexQuasar;
    discoveryStrategy: DiscoveryStrategy;
}

export type Scenario = {
    id: string
    name: string
    icon: string
    icon_url: string
    executable: boolean
    devices: any[]
    triggers: any[]
    is_active: boolean
}

export type YandexDevice = {
    id: string
    name: string
    type: string
    icon_url: string
    capabilities: any[]
    properties: any[]
    skill_id: string
    quasar_info: {
        device_id: string
        platform: string
        multiroom_available: boolean
        multistep_scenarios_available: boolean
        device_discovery_methods: any[]
    }
    item_type: string
    groups: any[]
    scenario_id: string
}

export type YandexLocalDevice = YandexDevice & {
    host: string
    port: string
}

export type YandexDeviceData = Omit<YandexDevice, "item_type" > & {
    status: string
    request_id: string
    updates_url: string
    names: string[]
    state: string
    external_id: string
    favorite: boolean
}

export type YandexDeviceConfig = {
    allow_non_self_calls: boolean
    beta: boolean
    led: {
        brightness: { auto: boolean, value: number }
        music_equalizer_visualization: { auto: boolean, style: string }
        time_visualization: { size: string }
    }
    location: any
    name: string
}

export type DevicesResponse = {
    status: string
    request_id: string
    rooms: any[]
    groups: any[]
    unconfigured_devices: YandexDevice[]
    speakers: YandexDevice[]
}

export type GetDeviceConfigResponse = {
    config: YandexDeviceConfig
    status: string
    version: string
}