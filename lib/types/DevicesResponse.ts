export type DevicesResponse = {
    status: "ok",
    request_id: string,
    households: DevicesResponseHousehold[],
    favorites: {
        properties: any[],
        items: any[],
        background_image: {
            id: string
        }
    },
    updates_url: string
}

export type DevicesResponseHousehold = {
    id: string,
    name: string,
    location: {
        address: string,
        short_address: string
    },
    is_current: boolean,
    rooms: DevicesResponseRoom[],
    all: DevicesResponseDevice[],
    all_background_image: {
        id: string
    }
}

export type DevicesResponseRoom = {
    id: string,
    name: string,
    items: DevicesResponseDevice[],
    background_image: {
        id: string
    }
}

export type DevicesResponseDevice = {
    id: string,
    name: string,
    type: string,
    icon_url: string,
    capabilities: DevicesResponseDeviceCapability[],
    properties: DevicesResponseDeviceProperty[],
    item_type: string,
    skill_id: string,
    room_name: string,
    created: string
}

export type DevicesResponseDeviceCapability = {

}

export type DevicesResponseDeviceProperty = {

}