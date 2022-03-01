import Homey, { DiscoveryStrategy } from 'homey';

import YandexSession from './session';
import YandexQuasar from './quasar';

export interface YandexApp extends Homey.App {
    session: YandexSession;
    quasar: YandexQuasar;
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
    device_id: string
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
        scenario_id?: string
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