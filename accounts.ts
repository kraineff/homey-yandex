import { ManagerSettings } from "homey/lib/Homey";
import Homey from "homey";

export class Accounts {
    private _accounts: {
        [accountId: string]: any
    };
    private _pendingInitAccounts: {
        [accountId: string]: Promise<any>
    };
    private _accountIdKey: string;
    private _settings: ManagerSettings;
    private _settingsKey: string;
    onInitAccount!: (accountData: any) => Promise<any>;
    onDestroyAccount!: (accountData: any) => Promise<void>;

    constructor(settings: ManagerSettings, settingsKey: string = "accounts", accountIdKey: string = "id") {
        this._settings = settings;
        this._settingsKey = settingsKey;
        this._accountIdKey = accountIdKey;
        this._accounts = {};
        this._pendingInitAccounts = {};
    }

    getAccountsData(): any[] {
        return this._settings.get(this._settingsKey) || [];
    }

    getAccountData(accountId: string): any | undefined {
        return this.getAccountsData().find(a => a[this._accountIdKey] === accountId);
    }

    saveAccountData(data: any) {
        const accounts = this.getAccountsData()
            .filter(a => a[this._accountIdKey] !== data[this._accountIdKey]);
        accounts.push(data);
        this._settings.set(this._settingsKey, accounts);
    }

    removeAccountData(accountId: string) {
        const accounts = this.getAccountsData()
            .filter(a => a[this._accountIdKey] !== accountId);
        this._settings.set(this._settingsKey, accounts);
    }

    async getAccounts() {
        if (Object.keys(this._pendingInitAccounts).length)
            await Promise.all(Object.values(this._pendingInitAccounts));
        return this._accounts;
    }

    async getAccount(accountId: string) {
        if (accountId in this._pendingInitAccounts) await this._pendingInitAccounts[accountId];
        return accountId in this._accounts ? this._accounts[accountId] : undefined;
    }

    async initAccounts() {
        this.getAccountsData().forEach(data => {
            this._pendingInitAccounts[data[this._accountIdKey]] = this.initAccount(data).then(() => {
                delete this._pendingInitAccounts[data[this._accountIdKey]];
            });
        });

        await Promise.all(Object.values(this._pendingInitAccounts));
    }

    async initAccount(data: any) {
        this._accounts[data[this._accountIdKey]] = await this.onInitAccount(data);
    }

    async destroyAccounts() {
        Object.keys(this._accounts).forEach(async accountId => await this.destroyAccount(accountId));
    }

    async destroyAccount(accountId: string) {
        if (!(accountId in this._accounts)) return;
        await this.onDestroyAccount(this._accounts[accountId]);
        delete this._accounts[accountId];
    }
}

export class AccountsDriver extends Homey.Driver {
    accounts!: Accounts;
    private _newDevices!: any[];
    onAddAccount?: (accountData: any) => Promise<void>;
    onRemoveAccount?: (accountId: string) => Promise<void>;
    onListAccounts!: () => Promise<any>;
    onListDevices!: () => Promise<any[]>;

    async onPair(session: Homey.Driver.PairSession) {
        session.setHandler("showView", async (viewId) => {
            if (viewId === "starting") {
                await this._checkNewDevices();
                //@ts-ignore
                await session.showView(this._newDevices.length ? "list_devices" : "list_accounts");
            }
        });

        session.setHandler("list_accounts", async () => await this.onListAccounts())
        session.setHandler("list_devices", async () => this._newDevices);

        session.setHandler("add_account", async accountData => {
            this.accounts.saveAccountData(accountData);
            await this.accounts.initAccount(accountData);
            if (this.onAddAccount) await this.onAddAccount(accountData);
            await this._checkNewDevices();
        });

        session.setHandler("remove_account", async (accountId: string) => {
            this.accounts.removeAccountData(accountId);
            await this.accounts.destroyAccount(accountId);
            if (this.onRemoveAccount) await this.onRemoveAccount(accountId);
            await this._checkNewDevices();
        });
    }

    private async _checkNewDevices() {
        this._newDevices = [];
        const devices = await this.onListDevices();

        const currentIds = this.getDevices()
            .map(device => device.getData().id)
            .sort();
        const allIds = devices
            .map(device => device.data.id)
            .sort();
        
        if (JSON.stringify(currentIds) !== JSON.stringify(allIds))
            this._newDevices = devices;
    }
}