import { CookieJar } from 'tough-cookie';

export type YandexSessionStorageToken = {
    accessToken: string;
    expiresAt: number;
};

export type YandexSessionStorageTokens = {
    am?: YandexSessionStorageToken;
    music?: YandexSessionStorageToken;
};

export type YandexSessionStorageContent = {
    tokens?: YandexSessionStorageTokens;
    cookieJar?: CookieJar.Serialized;
};

export type YandexSessionStorageHandlers = {
    get: () => Promise<YandexSessionStorageContent>;
    set: (content: YandexSessionStorageContent) => Promise<any>;
};

export class YandexSessionStorage {
    private _handlers: YandexSessionStorageHandlers;
    private _content?: string;

    constructor(handlers?: YandexSessionStorageHandlers) {
        this._handlers = handlers ?? {
            get: async () => JSON.parse(this._content || '{}'),
            set: async content => (this._content = JSON.stringify(content))
        };
    }

    private _deserializeToken(token: YandexSessionStorageToken | undefined) {
        if (!token) return undefined;
        const currentTime = Math.round(Date.now() / 1000);
        const isExpired = token.expiresAt - currentTime < 0;
        return (!isExpired && token.accessToken) || undefined;
    }

    private _serializeToken(token: any) {
        const currentTime = Math.round(Date.now() / 1000);
        const accessToken = token.access_token;
        const expiresIn = token.expires_in;
        const expiresAt = currentTime + expiresIn;
        return { accessToken, expiresAt } as YandexSessionStorageToken;
    }

    async getToken(service: keyof YandexSessionStorageTokens) {
        const content = await this._handlers.get();
        const tokens = (content.tokens = content.tokens || {});
        const token = tokens[service];
        return this._deserializeToken(token);
    }

    async setToken(service: keyof YandexSessionStorageTokens, token: any) {
        const content = await this._handlers.get();
        const tokens = (content.tokens = content.tokens || {});
        tokens[service] = this._serializeToken(token);
        await this._handlers.set(content);
    }

    async unsetToken(service: keyof YandexSessionStorageTokens) {
        const content = await this._handlers.get();
        const tokens = (content.tokens = content.tokens || {});
        delete tokens[service];
        await this._handlers.set(content);
    }

    async getCookieJar() {
        const content = await this._handlers.get();
        const cookieJar = content.cookieJar || JSON.stringify({ cookies: [] });
        return await CookieJar.deserialize(cookieJar);
    }

    async setCookieJar(cookieJar: CookieJar) {
        const content = await this._handlers.get();
        content.cookieJar = await cookieJar.serialize();
        await this._handlers.set(content);
    }
}
