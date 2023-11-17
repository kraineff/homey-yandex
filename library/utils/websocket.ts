import EventEmitter from 'events';
import { ClientRequestArgs } from 'http';
import { ClientOptions, RawData, WebSocket } from 'ws';

export type Options = {
    address: () => PromiseLike<string>;
    protocols?: string | string[];
    options?: ClientOptions | ClientRequestArgs;
    closeCodes?: number[];
    heartbeat?: number;
    message?: {
        transform?: (payload: any) => PromiseLike<any>;
        encode?: (payload: any) => PromiseLike<any>;
        decode?: (message: any) => PromiseLike<any>;
        identify?: (payload: any, message: any) => PromiseLike<boolean>;
    };
};

const DefaultOptions = {
    closeCodes: [1000, 1005, 1006],
    heartbeat: 0,
    message: {
        transform: async (payload: any) => payload,
        encode: async (payload: any) => payload,
        decode: async (message: any) => message,
        identify: async () => true
    }
};

export default class ReconnectSocket extends EventEmitter {
    #websocket?: WebSocket;
    #connectionLock: boolean;
    #heartbeatTimeout?: NodeJS.Timeout;
    #reconnectTimeout?: NodeJS.Timeout;
    #reconnectAttempt: number;

    constructor(public options: Options) {
        super();
        this.#connectionLock = false;
        this.#reconnectAttempt = 0;
    }

    async connect(timeoutSec: number = 10) {
        // Блокируем новые подключения, если сокет не закрыт
        if (this.#connectionLock) return;

        const address = await this.options.address();
        const { protocols, options } = this.options;
        this.#connectionLock = true;

        const promise = new Promise<void>((resolve, reject) => {
            this.#websocket = new WebSocket(address, protocols, options);
            this.#websocket.on('ping', () => this.#heartbeat());
            this.#websocket.on('error', console.error);
            
            this.#websocket.once('open', async () => {
                this.#heartbeat();
                this.emit('connect');
                resolve();
            });

            this.#websocket.on('close', async (code, reason) => {
                // Очищаем текущий сокет, разрешаем новые подключения
                this.#connectionLock = false;
                this.#websocket!.removeAllListeners();
                clearTimeout(this.#heartbeatTimeout);
                clearTimeout(this.#reconnectTimeout);
                this.emit('disconnect');

                // Отдаем ошибку при первом подключении, если код закрытия в списке
                const closeCodes = this.options.closeCodes ?? DefaultOptions.closeCodes;
                if (closeCodes.includes(code))
                    return reject(new Error('Подключение: закрытие'));

                await this.#reconnect();
            });

            this.#websocket.on('message', async (message) => {
                this.#heartbeat();
                
                // Декодируем сообщение или возвращаем оригинал
                const decode = this.options.message?.decode ?? DefaultOptions.message.decode;
                await decode(message)
                    .then(decoded => this.emit('message', decoded), console.error);
            });

            setTimeout(() => reject(new Error('Подключение: таймаут')), timeoutSec * 1000);
        });

        return promise.catch(error => {
            // Сбрасываем блокировку подключения при ошибке
            this.#connectionLock = false;
            return Promise.reject(error);
        });
    }

    async disconnect() {
        return new Promise<void>(resolve => {
            if (!this.#websocket) return resolve();
            this.#websocket.once('close', resolve);
            this.#websocket.close(1000);
        });
    }

    async send(payload: any, timeoutSec: number = 10) {
        return new Promise<any>(async (resolve, reject) => {
            await this.connect().then(undefined, reject);

            const transform = this.options.message?.transform ?? DefaultOptions.message.transform;
            const encode = this.options.message?.encode ?? DefaultOptions.message.encode;
            const decode = this.options.message?.decode ?? DefaultOptions.message.decode;
            const identify = this.options.message?.identify ?? DefaultOptions.message.identify;

            const transformed = await transform(payload).then(undefined, reject);
            const encoded = await encode(transformed).then(undefined, reject);

            async function handleMessage(this: WebSocket, message: RawData) {
                const decoded = await decode(message).then(undefined, reject);
                const isValid = await identify(transformed, decoded).then(undefined, reject);
                if (!isValid) return;

                resolve(decoded);
                this.off('message', handleMessage);
            }

            this.#websocket!.on('message', handleMessage);
            this.#websocket!.send(encoded);
            setTimeout(() => reject(new Error('Отправка: таймаут')), timeoutSec * 1000);
        });
    }

    #heartbeat() {
        const timeoutSec = this.options.heartbeat ?? DefaultOptions.heartbeat;
        if (timeoutSec <= 0) return;

        clearTimeout(this.#heartbeatTimeout);
        this.#heartbeatTimeout =
            setTimeout(async () => await this.#reconnect().catch(console.error), timeoutSec * 1000);
    }

    async #reconnect() {
        clearTimeout(this.#reconnectTimeout);
        this.#reconnectAttempt += 1;
        this.#reconnectTimeout =
            setTimeout(async () => await this.connect().catch(console.error), 1 * 1000);
    }
}