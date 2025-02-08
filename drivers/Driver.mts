import Homey from "homey";
import type YandexApp from "../app.mjs";
import type { Yandex } from "../library/index.js";

export default class Driver extends Homey.Driver {
    #yandex!: Yandex;

    async onInit() {
        this.#yandex = (this.homey.app as YandexApp).yandex;
    }

    async onPair(session: Homey.Driver.PairSession) {
        const platform = this.manifest.platform;
        const devices = await this.#yandex.home.updater.getDevicesByPlatform(platform).catch(() => null);

        session.setHandler("showView", async viewId => {
            if (viewId === "starting")
                await session.showView(devices !== null ? "list_devices" : "login_qr");
        });

        session.setHandler("list_devices", async () => {
            return (devices || []).map(device => ({
                name: device.name,
                data: { id: device.id }
            }));
        });

        session.setHandler("login_start", async () => {
            const authData = await this.#yandex.api.getAuthorization();
            const authTimer = setInterval(async () => {
                return this.#yandex.api.checkAuthorization(authData)
                    .catch((error: Error) => {
                        if (error.message !== "Ожидание авторизации") return true;
                        return false;
                    })
                    .then(value => {
                        if (!value) return;
                        clearInterval(authTimer);
                        session.emit("login_end", undefined);
                    });
            }, 2000);
        });
    }
}