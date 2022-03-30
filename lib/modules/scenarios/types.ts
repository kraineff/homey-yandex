export type Scenario = {
    id: string
    name: string
    triggers: (VoiceTrigger | TimeTrigger)[]
    steps: (DelayStep | ActionStep)[]
    icon: string
    icon_url: string
    is_active: boolean
    favorite: boolean
}

export type VoiceTrigger = {
    type: "scenario.trigger.voice"
    value: string
}

export type TimeTrigger = {
    type: "scenario.trigger.voice"
    value: {
        time_offset: number
        days_of_week: string[]
    }
}

export type DelayStep = {
    type: "scenarios.steps.delay"
    parameters: {
        delay_ms: number
    }
}

export type ActionStep = {
    type: "scenarios.steps.actions"
    parameters: {
        launch_devices: any[]
        requested_speaker_capabilities: any[]
    }
}