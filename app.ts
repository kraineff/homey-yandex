import Homey from "homey";
import { Accounts } from "./accounts";
import { API, Speaker, Updater, Eda } from "./lib";
import { OrdersTrackingResponse } from "./lib/types/EdaResponses";

export default class YandexAlice extends Homey.App {
    accounts!: Accounts;
    edaUpdateTrigger!: Homey.FlowCardTrigger;
    edaOrders!: OrdersTrackingResponse["payload"]["trackedOrders"];
    
    async onInit() {
        this.edaOrders = [];

        // Произнести текст
        const speakerTtsAction = this.homey.flow.getActionCard("speaker_tts");
        speakerTtsAction.registerRunListener(async args => {
            const device: Speaker = args.device.device;
            return await device.say(args.text);
        });

        // Выполнить команду
        const speakerRunAction = this.homey.flow.getActionCard("speaker_run");
        speakerRunAction.registerRunListener(async args => {
            const device: Speaker = args.device.device;
            return await device.run(args.command);
        });

        // Отслеживание еды
        this.edaUpdateTrigger = this.homey.flow.getTriggerCard("eda_update");
        this.edaUpdateTrigger.registerRunListener(async (args, state) => {
            return args.property === state.property;
        });

        await this.onAccounts();
    }

    async onAccounts() {
        this.accounts = new Accounts(this.homey.settings, undefined, "uid");
        this.accounts.onInitAccount = async (accountData: any) => {
            const api = new API();
            api.setCredentials(accountData);
            api.addListener("credentials", this._handleCredentials);

            const eda = new Eda(api);
            eda.addListener("refresh", this._handleEdaRefresh);
            await eda.startTracking();

            return { api, updater: new Updater(api), eda };
        };
        this.accounts.onDestroyAccount = async (account: any) => {
            account.updater.destroy();
            account.api.removeListener("credentials", this._handleCredentials);
            account.eda.removeListener("refresh", this._handleEdaRefresh);
            await account.eda.stopTracking();
        };
        await this.accounts.initAccounts();
    }

    private _handleCredentials = (credentials: any) => {
        this.accounts.saveAccountData(credentials);
    }

    private _handleEdaRefresh = async (orders: OrdersTrackingResponse) => {
        if (JSON.stringify(this.edaOrders) === JSON.stringify(orders.payload.trackedOrders)) return;

        orders.payload.trackedOrders.map(async order => {
            const cached = this.edaOrders.find(o => o.order.orderNr === order.order.orderNr);
            if (JSON.stringify(cached) === JSON.stringify(order)) return;

            const args = {
                ...(!cached || order.order.status.id !== cached.order.status.id ? { "status": order.order.status.id } : {}),
                ...(!cached || order.title !== cached.title ? { "title": order.title } : {}),
                ...(!cached || order.description !== cached.description ? { "description": order.description } : {}),
                ...(!cached || order.ShortTitle !== cached.ShortTitle ? { "shortTitle": order.ShortTitle } : {}),
                ...(!cached || order.ShortDescription !== cached.ShortDescription ? { "shortDescription": order.ShortDescription } : {}),
                ...(!cached || order.eta !== cached.eta ? { "eta": order.eta } : {}),
                ...(!cached || order.order.isAsap !== cached.order.isAsap ? { "isAsap": order.order.isAsap } : {}),
                ...(!cached || order.courier?.name !== cached.courier?.name ? { "courierName": order.courier?.name } : {}),
                ...(!cached || order.courier?.location !== cached.courier?.location ? { "courierLocation": order.courier?.location } : {}),
                ...(!cached || order.carInfo !== cached.carInfo ? { "car": order.carInfo } : {}),
            };

            const tokens = {
                status: order.order.status.id,
                title: order.title,
                description: order.description,
                shortTitle: order.ShortTitle,
                shortDescription: order.ShortDescription,
                eta: order.eta || 0,
                isAsap: order.order.isAsap,
                placeName: order.place.name,
                courierName: order.courier?.name || "",
                courierLatitude: order.courier?.location?.latitude || 0,
                courierLongitude: order.courier?.location?.longitude || 0,
                courierIsHardOfHearing: order.courier?.isHardOfHearing || false,
                service: order.service,
                carBrand: order.carInfo?.car_brand || "",
                carNumber: order.carInfo?.car_number || ""
            }

            await Promise.all(Object.entries(args).map(async ([key, value]) => {
                if (!this.edaUpdateTrigger) return Promise.resolve();
                await this.edaUpdateTrigger.trigger(tokens, { property: key }).catch(this.error);
            }));
        });

        this.edaOrders = orders.payload.trackedOrders;
    }
}

module.exports = YandexAlice;