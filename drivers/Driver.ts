import Homey from "homey";
import YandexAlice from "../app";
import { API } from "../lib";

export default class Driver extends Homey.Driver {
    app!: YandexAlice;
    newDevices!: any[];
    
    async onInit() {
        this.app = this.homey.app as YandexAlice;
        this.newDevices = [];
    }

    async onPair(session: Homey.Driver.PairSession) {
        const api = new API();
        let loginDetails: any;

        // Проверка новых устройств
        session.setHandler("showView", async (viewId) => {
            if (viewId === "starting") {
                await this.checkNewDevices();
                //@ts-ignore
                await session.showView(this.newDevices.length ? "list_devices" : "list_accounts");
            }
        });

        // Список аккаунтов
        session.setHandler("list_accounts", async () => {
            return (await Promise.all(this.app.apis.map(async api => {
                return await api[0].validateToken(api[0].token).then(data => ({
                    title: [data.display_name],
                    desc: [data.native_default_email],
                    logo: { url: data.avatar_url },
                    uid: api[0].uid
                })).catch(() => undefined);
            }))).filter(item => item !== undefined);
        });

        // Начало авторизации
        session.setHandler("start_auth", async () => {
            return await api.getLoginDetails().then(data => {
                loginDetails = data;
                return data.auth_url;
            });
        });

        // Проверка авторизации
        session.setHandler("check_auth", async () => {
            return await api.login(loginDetails).then(account => {
                this.app.saveAccount(account);
            });
        });

        // Удаление аккаунта
        session.setHandler("remove_account", async (uid: string) => {
            this.app.removeAccount(uid);
        });

        // Список новых устройств
        session.setHandler("list_devices", async () => {
            return this.newDevices;
        });
    }

    async checkNewDevices() {
        if (!this.app.apis.length) return;
        const devices: any[] = await this.getSpeakers();
        const current = this.getDevices().map(d => d.getData().id).sort();
        const all = devices.map(d => d.data.id).sort();

        if (JSON.stringify(current) !== JSON.stringify(all))
            this.newDevices = devices;
    }

    async getSpeakers() {
        return await Promise.all(this.app.apis.map(async api => {
            const url = "https://iot.quasar.yandex.ru/m/v3/user/devices";

            return await api[0].instance.get(url).then(res => {
                //@ts-ignore
                const devices = res.data.households.map(({ all }) => {
                    return all.filter((item: any) => item.quasar_info?.platform === this.manifest.platform).map((item: any) => ({
                        name: item.name,
                        data: {
                            id: item.id,
                            uid: api[0].uid
                        }
                    }));
                });

                return [].concat.apply([], devices);
            });
        })).then((data: any) => [].concat.apply([], data));
    }
}