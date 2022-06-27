import Homey from "homey";
import { API, Speaker, Updater } from "./lib";

type Account = {
    uid: string,
    token: string,
    cookies: string,
    music_token?: string
}

export default class YandexAlice extends Homey.App {  
    apis!: [API, Updater][];
    
    async onInit() {
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

        this.apis = [];
        const accounts = this.getAccounts();
        accounts.forEach(account => this.initAPI(account));
    }

    getAccounts(): Account[] {
        return this.homey.settings.get("accounts") || [];
    }

    saveAccount(account: Account) {
        const accounts = this.getAccounts()
            .filter(item => item.uid !== account.uid);
            
        accounts.push(account);
        this.homey.settings.set("accounts", accounts);
        this.initAPI(account);
    }

    removeAccount(uid: string) {
        const accounts = this.getAccounts()
            .filter(item => item.uid !== uid);
        this.homey.settings.set("accounts", accounts);

        const api = this.apis.find(api => api[0].uid === uid);
        if (api) this.destroyAPI(api);
    }

    getAPI(uid: string) {
        return this.apis.find(api => api[0].uid === uid);
    }

    initAPI(account: Account) {
        const api = new API();
        api.setCredentials(account);
        const updater = new Updater(api);
        this.apis.push([api, updater]);
    }

    destroyAPI(api: [API, Updater]) {
        api[0].destroy();
        api[1].destroy();
        this.apis = this.apis.filter(a => a !== api);
    }
}

module.exports = YandexAlice;