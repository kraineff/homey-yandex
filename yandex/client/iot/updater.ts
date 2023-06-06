import { YandexAPI } from '../../api';
import { strictJsonParse } from '../../utils/json';
import Socket from '../../utils/socket';
import EventEmitter from 'events';

export class YandexIotUpdater {
    private _api: YandexAPI;
    private _events: EventEmitter;
    private _socket: Socket;
    private _devices: {
        [id: string]: any;
    };

    get events() {
        return this._events;
    }

    constructor(api: YandexAPI) {
        this._api = api;
        this._events = new EventEmitter();
        this._devices = {};

        this._socket = new Socket({
            address: async () => {
                const response = await this._api.iot.getDevices();
                this._updateDevices(response.households);
                return response.updates_url;
            },
            heartbeat: 70,
            message: {
                decode: message => {
                    const json = strictJsonParse(message.toString());
                    const data = strictJsonParse(json.message);
                    return { operation: json.operation, ...data };
                }
            },
            listeners: {
                message: async message => {
                    switch (message.operation) {
                        case 'update_device_list': return await this._handleDevices(message);
                        case 'update_scenario_list': return await this._handleScenarios(message);
                        case 'update_states': return await this._handleStates(message);
                    }
                }
            }
        });
    }

    async init() {
        await this._socket.open();
    }

    getDevice(id: string) {
        return this._devices[id];
    }

    getDevices() {
        return this._devices;
    }

    getDevicesByType(type: string) {
        return Object.values(this._devices)
            .filter(device => device.type === type);
    }

    getDevicesByPlatform(platform: string) {
        return Object.values(this._devices)
            .filter(device => device.quasar_info?.platform === platform);
    }
    
    // source: 'discovery' | 'delete_device' | 'update_device' | 'update_room'
    private async _handleDevices(data: any) {
        this._updateDevices(data.households);
        this._events.emit('devices', this._devices);
    }
    
    // source: 'create_scenario' | 'delete_scenario' | 'create_scenario_launch' | 'update_scenario_launch'
    private async _handleScenarios(data: any) {
        this._events.emit('scenarios', data);
    }
    
    // source: 'query' | 'action' | 'callback'
    private async _handleStates(data: any) {
        this._events.emit('states', data);
    }

    private _updateDevices(households: any[]) {
        this._devices = households.reduce<any>((result, household) => {
            const devices = household.all;
            devices.map((device: any) => result[device.id] = device);
            return result;
        }, {});
    }
}