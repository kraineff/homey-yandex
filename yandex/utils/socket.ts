import { ClientOptions, RawData, WebSocket } from 'ws';
import { ClientRequestArgs } from 'http';

type SocketOptions = {
    address?: () => string | Promise<string>;
    protocols?: string | string[];
    options?: ClientOptions | ClientRequestArgs;
    closeCodes?: number[];
    heartbeat?: number;
    reconnect?: {
        max?: number;
        timeout?: (maxAttempts: number, attempt: number) => number | Promise<number>;
    };
    message?: {
        transform?: (payload: any) => any;
        encode?: (payload: any) => any;
        decode?: (message: any) => any;
        identify?: (payload: any, message: any) => boolean;
    };
    listeners?: {
        open?: () => void | Promise<void>;
        ping?: (data: Buffer) => void | Promise<void>;
        close?: (code: number, reason: Buffer) => void | Promise<void>;
        error?: (error: Error) => void | Promise<void>;
        message?: (message: any) => void | Promise<void>;
        reconnect?: (attempt: number) => void | Promise<void>;
    };
};

async function call<F extends (...args: any[]) => any, R extends ReturnType<F>>(func?: F, args?: Parameters<F>, fallback?: R): Promise<R> {
    args = args ?? [] as keyof typeof args;
    const value = await (func ?? (() => undefined))(...args);
    return value ?? fallback;
}

export default class Socket {
    private _socket?: WebSocket;
    private _heartbeatTimeout?: NodeJS.Timeout;
    private _reconnectTimeout?: NodeJS.Timeout;
    private _reconnectAttempt: number;

    constructor(public options: SocketOptions) {
        this._reconnectAttempt = 0;
    }

    get state() {
        return this._socket?.readyState ?? 3;
    }

    private _clean() {
        if (this._socket) this._socket.removeAllListeners();
        clearTimeout(this._heartbeatTimeout);
        clearTimeout(this._reconnectTimeout);
    }

    async open(timeout: number = 10000) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const { address, protocols, options } = this.options;

                if (!address)
                    throw new Error('Подключение > Нет ссылки');

                this._clean();
                setTimeout(() => {
                    this._socket && this._socket.readyState !== 1 && this._socket.terminate();
                    reject('Подключение > Таймаут')
                }, timeout);

                const addressStr = await call(address);
                this._socket = new WebSocket(addressStr, protocols, options);

                this._socket.once('open', async () => {
                    this.heartbeat();
                    await call(this.options.listeners?.open)
                        .then(resolve)
                        .catch(() => {});
                });

                this._socket.once('close', async (code, reason) => {
                    this._clean();
                    await call(this.options.listeners?.close, [code, reason])
                        .catch(() => {});

                    const closeCodes = [1000, 1005, 1006, ...(this.options.closeCodes || [])];
                    if (closeCodes.includes(code)) return reject(`Сокет > Закрытие: ${code}, ${reason}`);
                    await this.reconnect();
                });

                this._socket.on('ping', async data => {
                    this.heartbeat();
                    await call(this.options.listeners?.ping, [data])
                        .catch(() => {});
                });

                this._socket.on('error', async error => {
                    await call(this.options.listeners?.error, [error])
                        .catch(() => {});
                });

                this._socket.on('message', async (message) => {
                    this.heartbeat();
                    await call(this.options.message?.decode, [message], message)
                        .then(async decodedMsg => await call(this.options.listeners?.message, [decodedMsg]))
                        .catch(() => {});
                });
            } catch (e) { reject(e) }
        });
    }

    async close() {
        if (!this._socket) return;
        this._socket.close(1000);
    }

    async send(payload: any, timeout: number = 10000) {
        return new Promise<any>(async (resolve, reject) => {
            try {
                if (!this._socket || this._socket.readyState !== 1)
                    await this.open();

                const options = this.options;
                const transformedPayload = await call(this.options.message?.transform, [payload], payload);
                const encodedPayload = await call(this.options.message?.encode, [transformedPayload], transformedPayload);

                async function handleMessage(this: WebSocket, message: RawData) {
                    try {
                        const decodedMsg = await call(options.message?.decode, [message], message);
                        const isValid = await call(options.message?.identify, [transformedPayload, decodedMsg], true);
                        if (!isValid) return;
                        resolve(decodedMsg);
                    } catch (e) { reject(e) }

                    this.off('message', handleMessage);
                }

                this._socket!.on('message', handleMessage);
                this._socket!.send(encodedPayload);
                setTimeout(() => reject('Отправка > Таймаут'), timeout);
            } catch (e) { reject(e) }
        });
    }

    private heartbeat() {
        const timeoutSec = this.options.heartbeat || 0;
        const timeoutMs = timeoutSec * 1000;

        if (timeoutSec > 0) {
            clearTimeout(this._heartbeatTimeout);
            this._heartbeatTimeout = setTimeout(async () => await this.reconnect(), timeoutMs);
        }
    }

    private async reconnect() {
        const maxAttempts = this.options.reconnect?.max ?? Infinity;
        const timeoutSec = await call(this.options.reconnect?.timeout, [maxAttempts, this._reconnectAttempt + 1], 1);
        const timeoutMs = timeoutSec * 1000;

        if (this._reconnectAttempt < maxAttempts) {
            clearTimeout(this._reconnectTimeout);

            this._reconnectTimeout = setTimeout(async () => {
                await call(this.options.listeners?.reconnect, [this._reconnectAttempt += 1])
                    .then(async () => await this.open())
                    .catch(() => {});
            }, timeoutMs);
        }
    }
}
