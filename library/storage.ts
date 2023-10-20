import { CookieJar } from 'tough-cookie';

export type YandexStorageToken = {
    accessToken: string;
    expiresAt: number;
};

export type YandexStorageContent = {
    tokens?: {
        [clientId: string]: YandexStorageToken;
    };
    cookieJar?: CookieJar.Serialized;
};

export type YandexStorageHandlers = {
    get: () => Promise<YandexStorageContent>;
    set: (content: YandexStorageContent) => Promise<any>;
};

export class YandexStorage {
    #handlers: YandexStorageHandlers;
    #content: string;

    constructor(handlers?: YandexStorageHandlers) {
        this.#content = '{}';
        this.#handlers = handlers ?? {
            get: async () => JSON.parse(this.#content),
            set: async content => (this.#content = JSON.stringify(content))
        };
    }

    async getCookieJar() {
        const content = await this.#handlers.get();
        const cookieJar = content.cookieJar || JSON.stringify({ cookies: [] });
        return await CookieJar.deserialize(cookieJar);
    }

    async setCookieJar(cookieJar: CookieJar) {
        const content = await this.#handlers.get();
        content.cookieJar = await cookieJar.serialize();

        await this.#handlers.set(content);
        return cookieJar;
    }

    async getToken(clientId: string) {
        const content = await this.#handlers.get();
        const tokens = (content.tokens = content.tokens || {});
        const token = tokens[clientId] as YandexStorageToken;
        if (token === undefined) throw new Error('Нет токена');
        
        const currentTime = Math.round(Date.now() / 1000);
        if (token.expiresAt - currentTime < 0)
            throw new Error('Токен устарел');
        
        return token.accessToken;
    }

    async setToken(clientId: string, token: any) {
        const accessToken = token.access_token as string;
        const expiresIn = token.expires_in as number;

        if (accessToken === undefined || expiresIn === undefined)
            throw new Error('Недействительный токен');

        const currentTime = Math.round(Date.now() / 1000);
        const expiresAt = currentTime + expiresIn;
        const content = await this.#handlers.get();
        const tokens = (content.tokens = content.tokens ?? {});
        tokens[clientId] = { accessToken, expiresAt };

        await this.#handlers.set(content);
        return accessToken;
    }
}