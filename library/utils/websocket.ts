import EventEmitter from "node:events";
import type { ClientRequestArgs } from "node:http";
import { type ClientOptions, type RawData, WebSocket } from "ws";

export type Options = {
	address: () => PromiseLike<string>;
	protocols?: string | string[];
	options?: ClientOptions | ClientRequestArgs;
	closeCodes?: number[];
	heartbeat?: number;
	message?: MessageOptions;
};

export type MessageOptions = {
	modify?: (payload: any) => PromiseLike<any>;
	encode?: (payload: any) => PromiseLike<any>;
	decode?: (message: Buffer | ArrayBuffer | Buffer[]) => PromiseLike<any>;
	match?:  (payload: any, message: any) => PromiseLike<boolean>;
}

type ReconnectSocketOptions = Required<Options & { message: Required<MessageOptions> }>;

export class ReconnectSocket extends EventEmitter {
	#websocket?: WebSocket;
	#websocketConnect?: Promise<void>;
	#websocketDisconnect?: Promise<void>;
	#heartbeatTimeout?: NodeJS.Timeout;
	#reconnectTimeout?: NodeJS.Timeout;
	#reconnectAttempt = 0;

	options: ReconnectSocketOptions;

	constructor(options: Options) {
		super();
		this.options = {
			protocols: [],
			options: {},
			closeCodes: [1000, 1005, 1006],
			heartbeat: 0,
			message: {
				modify: async (payload) => payload,
				encode: async (payload) => payload,
				decode: async (message) => message,
				match:  async () => true,
				...options.message
			},
			...options
		} as ReconnectSocketOptions;
	}

	async connect(timeoutSec = 10) {
		if (this.#websocketConnect) return this.#websocketConnect;
		if (this.#websocket?.readyState === WebSocket.OPEN) return;

		this.#websocketConnect = (async () => {
			try {
				const address = await this.options.address();
				const { protocols, options } = this.options;

				await new Promise<void>((resolve, reject) => {
					this.#websocket = new WebSocket(address, protocols, options);
					this.#websocket.on("ping", () => this.#heartbeat());
					this.#websocket.on("error", reject);

					this.#websocket.once("open", async () => {
						this.#reconnectAttempt = 0;
						this.#heartbeat();
						this.emit("connect");
						resolve();
					});

					this.#websocket.once("close", async (code) => {
						if (!this.options.closeCodes.includes(code)) return this.#reconnect();
						this.#cleanup();
						this.emit("disconnect");
						reject("Ошибка подключения");
					});

					this.#websocket.on("message", async (message) => {
						this.#heartbeat();
						await this.options.message.decode(message)
							.then((decoded) => this.emit("message", decoded), console.error);
					});

					setTimeout(() => reject(new Error("Ошибка подключения: таймаут")), timeoutSec * 1000);
				});
			} finally {
				this.#websocketConnect = undefined;
			}
		})();

		return this.#websocketConnect;
	}

	async disconnect() {
		if (this.#websocketDisconnect) return this.#websocketDisconnect;
		if (!this.#websocket || this.#websocket.readyState === WebSocket.CLOSED) return;
		
		this.#websocketDisconnect = (async () => {
			await new Promise<void>((resolve) => {
				this.once("disconnect", resolve);
				this.#websocket?.close(1000);
			});
			this.#websocketDisconnect = undefined;
		})();

		return this.#websocketDisconnect;
	}

	async send(payload: any, timeoutSec = 10) {
		await this.connect();

		const { modify, encode, decode, match } = this.options.message;
		const modified = await modify(payload);
		const encoded = await encode(modified);

		return new Promise<any>((resolve, reject) => {
			const listener = async (message: RawData) => {
				await decode(message).then(decoded => {
					return match(modified, decoded).then(matched => {
						if (!matched) return;
						resolve(decoded);
						this.#websocket?.removeListener("message", listener);
					});
				}, reject);
			};

			this.#websocket?.addListener("message", listener);
			this.#websocket?.send(encoded);

			setTimeout(() => {
				reject(new Error("Ошибка отправки: таймаут"));
				this.#websocket?.removeListener("message", listener);
			}, timeoutSec * 1000);
		});
	}

	#heartbeat() {
		clearTimeout(this.#heartbeatTimeout);
		const timeoutSec = this.options.heartbeat;
		if (timeoutSec <= 0) return;

		this.#heartbeatTimeout = setTimeout(() => {
			this.#websocket?.terminate();
			this.#reconnect();
		}, timeoutSec * 1000);
	}

	#reconnect() {
		clearTimeout(this.#reconnectTimeout);
		const timeoutMs = Math.min(1000 * 2 ** this.#reconnectAttempt, 30000);

		this.#reconnectAttempt += 1;
		this.#reconnectTimeout = setTimeout(async () => {
			await this.connect().catch(console.error);
		}, timeoutMs);
	}

	#cleanup() {
		clearTimeout(this.#heartbeatTimeout);
		clearTimeout(this.#reconnectTimeout);
		this.#websocket?.removeAllListeners();
    	this.#websocket = undefined;
	}
}
