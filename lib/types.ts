import Homey, { DiscoveryStrategy } from 'homey';

import Yandex from './yandex';

export interface YandexApp extends Homey.App {
    yandex: Yandex;
    discoveryStrategy: DiscoveryStrategy;
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
    icon: string
    type: string
}

export type Speaker = Device & {
    quasar: {
        id: string
        platform: string
    }
    local?: {
        address: string
        port: string
    }
}

export type SpeakerConfig = {
    allow_non_self_calls: boolean
    beta: boolean
    led?: {
        brightness: { auto: boolean, value: number }
        music_equalizer_visualization: { auto: boolean, style: string }
        time_visualization: { size: string }
    }
    location: any
    name: string
}