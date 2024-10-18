export type YandexStorageHandlers = {
    get: () => Promise<YandexStorageContent>;
    set: (content: YandexStorageContent) => Promise<any>;
};

export type YandexStorageContent = {
    cookieJar?: string;
    tokens?: {
        [clientId: string]: YandexStorageToken;
    };
};

export type YandexStorageToken = {
    accessToken: string;
    expiresAt: number;
};