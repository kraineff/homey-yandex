import { CookieJar } from "tough-cookie";

export type YandexStorageHandlers = {
    get: () => PromiseLike<YandexStorageContent>;
    set: (content: YandexStorageContent) => PromiseLike<any>;
}

export type YandexStorageContent = {
    cookieJar?: string;
    tokens?: Record<string, YandexStorageToken>;
}

export type YandexStorageToken = {
    accessToken: string;
    expiresAt: number;
}

export class YandexStorage {
    private content?: Omit<YandexStorageContent, "cookieJar"> & {
        cookieJar: CookieJar;
    };

    constructor(private handlers: YandexStorageHandlers) {}

    private async getContent() {
        if (this.content) return this.content;

        const content = await this.handlers.get();
        const cookieJar = await CookieJar.deserialize(content.cookieJar || JSON.stringify({ cookies: [] }));
        return this.content = { ...content, cookieJar };
    }

    private async setContent() {
        if (!this.content) return;

        const cookieJar = JSON.stringify(this.content.cookieJar.toJSON());
        const content = { ...this.content, cookieJar };
        await this.handlers.set(content);
    }

    async getCookies(address: string) {
        const cookieJar = (await this.getContent()).cookieJar;
        return await cookieJar.getCookieString(address);
    }

    async setCookies(address: string, cookies: string[]) {
        const cookieJar = (await this.getContent()).cookieJar;
        await Promise.all(cookies.map(item => cookieJar.setCookie(item, address)));
        await this.setContent();
    }

    async removeCookies() {
        const content = await this.getContent();
        content.cookieJar = new CookieJar();
        await this.setContent();
    }

    async getTokens() {
        const content = await this.getContent();
        return content.tokens || {};
    }

    async getToken(clientId: string) {
        const tokens = await this.getTokens();
        const token = tokens[clientId] as YandexStorageToken;
        if (token === undefined) throw new Error("Нет токена");
        
        const currentTime = Math.round(Date.now() / 1000);
        if (token.expiresAt - currentTime < 0)
            throw new Error("Токен устарел");
        
        return token.accessToken;
    }

    async setToken(clientId: string, token: any) {
        const accessToken = token.access_token as string;
        const expiresIn = token.expires_in as number;

        if (accessToken === undefined || expiresIn === undefined)
            throw new Error("Недействительный токен");

        const currentTime = Math.round(Date.now() / 1000);
        const expiresAt = currentTime + expiresIn;
        const content = await this.getContent();
        content.tokens = content.tokens || {};
        content.tokens[clientId] = { accessToken, expiresAt };
        
        await this.setContent();
        return accessToken;
    }
}