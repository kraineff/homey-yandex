import Homey from 'homey';
import YandexApp from '../app';
import { Yandex } from '../yandex';

export default class Driver extends Homey.Driver {
    private _yandex!: Yandex;
    private _devices!: any;
    private _authState!: boolean;
    private _authData!: any;

    async onInit() {
        const app = this.homey.app as YandexApp;
        this._yandex = app.yandex;
    }

    async onPair(session: Homey.Driver.PairSession) {
        this._authState = false;
        
        session.setHandler('showView', async viewId => {
            if (viewId === 'starting') {
                await this._checkNewDevices();
                await session.showView(this._devices.length ?
                    'list_devices' :
                    'account_settings'
                );
            }
        });

        session.setHandler('list_devices', async () => this._devices);
        session.setHandler('account_settings', async () => this._authState);
        
        session.setHandler('account_login', async () => {
            this._authData = await this._yandex.getAuthorization();
            return this._authData.auth_url;
        });

        session.setHandler('account_confirm', async () => {
            await this._yandex.confirmAuthorization(this._authData).then(async () => {
                await this._checkNewDevices();
            });
        });
    }

    private async _getDevices() {
        const platform = this.manifest.platform;

        return await this._yandex.iot.getUpdater().then(updater => {
            this._authState = true;
            const devices = updater.getDevicesByPlatform(platform);
            return devices.map(({ name, id }) => ({ name, data: { id } }));
        }).catch(() => []);
    }

    private async _checkNewDevices() {
        const devices = await this._getDevices();
        const devicesIds = devices.map(device => device.data.id).sort();
        const currentIds = this.getDevices()
            .map(device => device.getData().id).sort();

        this._devices = [];
        if (JSON.stringify(devicesIds) !== JSON.stringify(currentIds))
            this._devices = devices;
    }
}