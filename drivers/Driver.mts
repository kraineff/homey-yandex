import Homey from "homey";
import { Yandex } from "../library/index.mjs";

export default class Driver extends Homey.Driver {
    private yandex!: Yandex;

    async onInit() {
        const app = this.homey.app as any;
        this.yandex = app.yandex;
    }

    async onPair(session: Homey.Driver.PairSession) {
        const platform = this.manifest.platform;
        const devices = await this.yandex.home.updater.getDevicesByPlatform(platform)
            .catch(() => null);

        session.setHandler("showView", async viewId => {
            if (viewId !== "starting") return;
            await session.showView(devices !== null ? "list_devices" : "login_qr");
        });

        session.setHandler("login_start", async () => {
            const payload = await this.yandex.api.getAuthorization();
            const checkAuth = setInterval(async () => {
                const authReady = await this.yandex.api.checkAuthorization(payload)
                    .then(() => true)
                    .catch((err: Error) => {
                        if (err.message !== "Ожидание авторизации")
                            return true;
                        return false;
                    });

                if (authReady) {
                    clearInterval(checkAuth);
                    session.emit("login_end", undefined);
                }
            }, 2000)

            return payload.auth_url;
        });

        session.setHandler("list_devices", async () => {
            return devices!.map(device => ({
                name: device.name,
                data: { id: device.id }
            }));
        });
    }
}