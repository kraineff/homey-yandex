import YandexDevice from "./types/device";
import YandexSpeaker from "./types/speaker";

export type Device = YandexSpeaker | YandexDevice;

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