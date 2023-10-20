import Homey from 'homey';
import { Yandex } from '../library';

export default class Driver extends Homey.Driver {
    #yandex!: Yandex;

    async onInit() {
        const app = this.homey.app as any;
        this.#yandex = app.yandex;
    }

    async onPair(session: Homey.Driver.PairSession) {
        session.setHandler('showView', async viewId => {
            if (viewId !== 'starting') return;
            const authState = await this.#yandex.iot.getUpdater()
                .then(() => true)
                .catch(() => false);

            await session.showView(authState ? 'list_devices' : 'login_qr');
        });

        session.setHandler('login_start', async () => {
            const payload = await this.#yandex.getAuthorization();
            const checkAuth = setInterval(async () => {
                const authReady = await this.#yandex.checkAuthorization(payload)
                    .then(() => true)
                    .catch((err: Error) => {
                        if (err.message !== 'Ожидание авторизации')
                            return true;
                        return false;
                    });

                if (authReady) {
                    clearInterval(checkAuth);
                    session.emit('login_end', undefined);
                }
            }, 2000)

            return payload.auth_url;
        });

        session.setHandler('list_devices', async () => {
            const platform = this.manifest.platform;
            const updater = await this.#yandex.iot.getUpdater();
            const devices = updater.getDevicesByPlatform(platform);

            return devices.map(device => ({
                name: device.name,
                data: { id: device.id }
            }));
        });
    }
}