import { CookieJar } from "tough-cookie";

export type YandexStorageHandlers = {
	get: () => PromiseLike<StorageContent>;
	set: (content: StorageContent) => PromiseLike<void>;
};

type StorageContent = {
	cookieJar?: string;
	tokens?: Record<string, StorageToken>;
};

type StorageToken = {
	accessToken: string;
	expiresAt: number;
};

export class YandexStorage {
	#handlers: YandexStorageHandlers;
	#content?: Omit<StorageContent, "cookieJar"> & { cookieJar: CookieJar };

	constructor(handlers: YandexStorageHandlers) {
		this.#handlers = handlers;
	}

	private async getContent() {
		if (this.#content) return this.#content;

		const content = await this.#handlers.get();
		const cookieJarStr = content.cookieJar || JSON.stringify({ cookies: [] });
		const cookieJar = await CookieJar.deserialize(cookieJarStr);
		this.#content = { ...content, cookieJar };

		return this.#content;
	}

	private async setContent() {
		if (!this.#content) return;

		const cookieJar = JSON.stringify(this.#content.cookieJar.toJSON());
		const content = { ...this.#content, cookieJar };
		await this.#handlers.set(content);
	}

	async getCookies(address: string) {
		const cookieJar = (await this.getContent()).cookieJar;
		return await cookieJar.getCookieString(address);
	}

	async setCookies(address: string, cookies: string[]) {
		const cookieJar = (await this.getContent()).cookieJar;
		await Promise.all(cookies.map((item) => cookieJar.setCookie(item, address)));
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
		const token = tokens[clientId];
		const currentTime = Math.round(Date.now() / 1000);

		if (token === undefined) throw new Error("Нет токена");
		if (token.expiresAt - currentTime < 0) throw new Error("Токен устарел");

		return token.accessToken;
	}

	async setToken(clientId: string, token: { access_token: string; expires_in: number }) {
		const accessToken = token.access_token;
		const expiresIn = token.expires_in;

		if (accessToken === undefined || expiresIn === undefined) throw new Error("Недействительный токен");

		const currentTime = Math.round(Date.now() / 1000);
		const expiresAt = currentTime + expiresIn;

		const content = await this.getContent();
		content.tokens = content.tokens || {};
		content.tokens[clientId] = { accessToken, expiresAt };

		await this.setContent();
		return accessToken;
	}
}
