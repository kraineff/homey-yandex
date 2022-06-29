import Homey from "homey";
import { AccountsDriver } from "../accounts";
import YandexAlice from "../app";
import { API } from "../lib";

export default class Driver extends AccountsDriver {
    private _app!: YandexAlice;
    
    async onInit() {
        this._app = this.homey.app as YandexAlice;
        this.accounts = this._app.accounts;

        this.onListAccounts = async () => {
            const accs = Object.values(this.accounts.getAccounts());
            const promises = accs.map(account => account.api.validateToken(account.api.token).then((data: any) => ({
                title: [data.display_name],
                desc: [data.native_default_email],
                logo: { url: data.avatar_url },
                uid: account.api.uid
            })).catch(() => undefined));

            const result = await Promise.all(promises);
            return result.filter(account => account !== undefined);
        };

        this.onListDevices = async () => {
            const accs = Object.values(this.accounts.getAccounts());
            const url = "https://iot.quasar.yandex.ru/m/v3/user/devices";
            const promises = accs.map(account => account.api.instance.get(url).then((res: any) => {
                //@ts-ignore
                const devices = res.data.households.map(({ all }) => all
                    .filter((item: any) => item.quasar_info?.platform === this.manifest.platform)
                    .map((item: any) => ({
                        name: item.name,
                        data: {
                            id: item.id,
                            uid: account.api.uid
                        }
                    })));
                return [].concat.apply([], devices);
            }));

            const result = await Promise.all(promises);
            return [].concat.apply([], result);
        };
    }

    async onPair(session: Homey.Driver.PairSession) {
        await super.onPair(session);
        const api = new API();
        let loginDetails: any;

        session.setHandler("start_auth", async () => {
            return await api.getLoginDetails().then(data => {
                loginDetails = data;
                return data.auth_url;
            });
        });
        session.setHandler("check_auth", async () => await api.login(loginDetails));
    }
}