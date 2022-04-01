export type DeviceData = BaseDeviceData | SpeakerData | RemoteData;

export type BaseDeviceData = {
    id: string
    name: string
    type: string
    icon_url: string
    state: string
    capabilities: any[]
    properties: any[]
    settings: {
        names: string[]
        groups: any[]
        child_device_ids: string[]
        skill_id: string
        device_info: {
            manufacturer: string
            model: string
            hw_version?: string
            sw_version?: string
        }
        favorite: boolean
        external_name: string
        external_id: string
        fw_upgradable: boolean
        room: {
            id: string
            name: string
        }
        household: {
            id: string
            name: string
        }
    }
    created: string
}

export type RemoteData = BaseDeviceData & {
    render_info: {
        icon: {
            id: string
        }
    }
    settings: {
        infrared_info: {
            learned: boolean
            transmitter_id: string
        }
    }
}

export type SpeakerData = BaseDeviceData & {
    settings: {
        quasar_info: {
            device_id: string
            platform: string
            multiroom_available: boolean
            multistep_scenarios_available: boolean
            device_discovery_methods: any[]
        }
        quasar_config: {
            beta: boolean
            name: string
            allow_non_self_calls?: boolean
            equalizer?: {
                active_preset_id: any
                bands: any[]
                enabled: boolean
                smartEnabled: boolean
            }
            led?: {
                brightness: {
                    auto: boolean
                    value: number
                }
                music_equalizer_visualization: {
                    auto: boolean
                    style: string
                }
                time_visualization: {
                    size: string
                }
            }
        }
        quasar_config_version: string
        tandem: {
            candidates: any[]
        }
    }
}