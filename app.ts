import Homey from "homey";
import { Accounts } from "./accounts";
import { API, Speaker, Updater } from "./lib";

export default class YandexAlice extends Homey.App {
    accounts!: Accounts;
    
    async onInit() {
        this.onAccounts();

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
    }

    onAccounts() {
        this.accounts = new Accounts(this.homey.settings, undefined, "uid");
        this.accounts.onInitAccount = async (accountData: any) => {
            const api = new API();
            api.setCredentials(accountData);
            api.addListener("credentials", this._handleCredentials);
            const updater = new Updater(api);
            return { api, updater };
        };
        this.accounts.onDestroyAccount = async (account: any) => {
            account.updater.destroy();
            account.api.removeListener("credentials", this._handleCredentials);
        };
        this.accounts.initAccounts();
    }

    private _handleCredentials = (credentials: any) => {
        this.accounts.saveAccountData(credentials);
    }
}

module.exports = YandexAlice;