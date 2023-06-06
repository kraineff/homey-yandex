import Socket from '../../../utils/socket';
import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import { YandexAPI } from '../../../api';
import { YandexIotUpdater } from '../updater';
import { YandexIotSpeakerState } from '../types';
import { strictJsonParse } from '../../../utils/json';

type CommandParams = {
    cloud?: string;
    cloudInstance?: string;
    local?: string;
    localArgs?: Object;
    volume?: number;
};

enum AliceState {
    IDLE = 'IDLE',
    SPEAKING = 'SPEAKING'
};

enum Connection {
    LOCAL = 0,
    CLOUD = 1,
    CLOUD_ONLY = 2
};

export class YandexIotSpeaker {
    private _id: string;
    private _api: YandexAPI;
    private _updater: YandexIotUpdater;
    private _events: EventEmitter;

    private _glagolId: string;
    private _glagolPlatform: string;
    private _glagolToken?: string;
    private _glagolSocket: Socket;

    private _connection: number;
    state: Partial<YandexIotSpeakerState>;

    get id() {
        return this._id;
    }

    get events() {
        return this._events;
    }

    constructor(id: string, api: YandexAPI, updater: YandexIotUpdater) {
        this._id = id;
        this._api = api;
        this._updater = updater;
        this._events = new EventEmitter();
        this._connection = Connection.CLOUD;
        this.state = { volume: 0, playing: false };
        
        const quasarDevice = this._updater.getDevice(id);
        const quasarInfo = quasarDevice.quasar_info;

        this._glagolId = quasarInfo.device_id;
        this._glagolPlatform = quasarInfo.platform;
        this._glagolSocket = new Socket({
            address: async () => {
                const glagolDevices = await this._api.iot.getGlagolDevices();
                const glagolDevice = glagolDevices.find((glagolDevice: any) => glagolDevice.id === this._glagolId)!;
                
                if (!glagolDevice.networkInfo) {
                    this._connection = Connection.CLOUD_ONLY;
                    throw new Error('Нет локального управления');
                }

                const glagolAddress = glagolDevice.networkInfo.ip_addresses[0];
                const glagolPort = glagolDevice.networkInfo.external_port;

                this._glagolToken = await this._api.iot.getGlagolToken(quasarInfo.device_id, quasarInfo.platform);
                return `wss://${glagolAddress}:${glagolPort}`;
            },
            options: { rejectUnauthorized: false },
            closeCodes: [],
            heartbeat: 10,
            message: {
                transform: payload => ({
                    id: randomUUID(), sentTime: Date.now(),
                    conversationToken: this._glagolToken,
                    payload
                }),
                encode: payload => JSON.stringify(payload),
                decode: message => strictJsonParse(message.toString()),
                identify: (payload, message) =>
                    message.requestId === payload.id &&
                    message.requestSentTime === payload.sentTime
            },
            listeners: {
                open: async () => {
                    await this._glagolSocket.send({ command: 'softwareVersion' });
                    this._connection = Connection.LOCAL;
                },
                close: () => { this._connection = Connection.CLOUD; },
                message: async (message) => {
                    const state = message.state;
                    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
                    this.state = state;
                    this._emitState();
                }
            }
        });

        this._glagolSocket.open().catch(() => {});
    }

    private _emitState() {
        const state = this.state;
        this._events.emit('state', state);
    }

    private async _command(params: CommandParams) {
        if (params.volume === undefined || (params.volume !== undefined && params.local !== undefined && this._connection === Connection.LOCAL))
            return await this._commandSimple(params);
        
        await this._commandWithVolume(params);
    }

    private async _commandSimple(params: Omit<CommandParams, 'volume'>) {
        const { cloud, cloudInstance, local, localArgs } = params;

        const sendToCloud = async () => {
            cloud && await this._api.iot.runDeviceAction(this._id, [{
                type: 'devices.capabilities.quasar.server_action',
                state: { instance: cloudInstance ?? 'text_action', value: cloud }
            }]);
        };

        if (local && this._connection !== Connection.CLOUD_ONLY) {
            await this._glagolSocket.send({ command: local, ...(localArgs || {}) })
                .catch(async () => await sendToCloud());
            return;
        }

        await sendToCloud();
    }

    private async _commandWithVolume(params: CommandParams) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const { volume, ...command } = params;
                const currentVolume = this.state.volume!;
                const currentPlaying = this.state.playing!;

                await this.mediaPause();
                await this.volumeSet(volume!);
                await this._commandSimple(command);

                const after = async () => {
                    await this.volumeSet(currentVolume);
                    if (currentPlaying) await this.mediaPlay();
                    resolve();
                };

                if (this._connection === Connection.LOCAL) {
                    let aliceState: string;

                    const handleState = async (state: YandexIotSpeakerState) => {
                        if ((aliceState === AliceState.SPEAKING && state.aliceState !== aliceState) ||
                            (aliceState === AliceState.IDLE && state.aliceState === AliceState.IDLE)) {
                                this._events.off('state', handleState);
                                await after();
                        }
                        aliceState = state.aliceState;
                    };
                    
                    this._events.on('state', handleState);
                } else await after();
            } catch (e) { reject(e) }
        });
    }

    // ДЕЙСТВИЯ

    async actionSay(message: string, volume?: number) {
        volume = volume ?? this.state.volume;
        await this._command({ cloud: message, cloudInstance: 'phrase_action', volume });
    }

    async actionRun(command: string, volume?: number) {
        volume = volume ?? this.state.volume;
        await this._command({ cloud: command, volume });
    }

    // УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ

    async mediaGoUp() {
        await this._command({ cloud: 'вверх', local: 'control', localArgs: { action: 'go_up' } });
    }

    async mediaGoDown() {
        await this._command({ cloud: 'вниз', local: 'control', localArgs: { action: 'go_down' } });
    }

    async mediaGoLeft() {
        await this._command({ cloud: 'влево', local: 'control', localArgs: { action: 'go_left' } });
    }

    async mediaGoRight() {
        await this._command({ cloud: 'вправо', local: 'control', localArgs: { action: 'go_right' } });
    }

    async mediaGoHome() {
        await this._command({ cloud: 'домой' });
    }

    async mediaGoBack() {
        await this._command({ cloud: 'назад' });
    }

    async mediaPower(enable: boolean) {
        await this._command({
            cloud: (enable && 'включи' || 'выключи') + 'телевизор',
            volume: 0
        });
    }

    async mediaClick() {
        await this._command({ cloud: 'нажми', local: 'control', localArgs: { action: 'click_action' } });
    }

    // УНИВЕРСАЛЬНЫЕ

    async mediaPlay() {
        if (this.state.playing) return;
        await this._command({ cloud: 'играй', local: 'play' });
        this.state.playing = true;
        this._emitState();
    }

    async mediaPause() {
        if (!this.state.playing) return;
        await this._command({ cloud: 'стоп', local: 'stop' });
        this.state.playing = false;
        this._emitState();
    }

    async mediaRewind(position: number) {
        await this._command({ local: 'rewind', localArgs: { position } });
    }

    async mediaNext() {
        await this._command({ cloud: 'следующий', local: 'next' });
        this.state.playing = true;
        this._emitState();
    }

    async mediaPrev() {
        await this._command({ cloud: 'предыдущий', local: 'prev' });
        this.state.playing = true;
        this._emitState();
    }

    // МУЗЫКА

    async musicShuffle(enable: boolean) {
        if (this.state.playerState?.entityInfo.shuffled === enable) return;
        await this._command({ cloud: 'перемешай', local: 'shuffle', localArgs: { enable }, volume: 0 });

        this.state.playerState = this.state.playerState || {} as any;
        this.state.playerState!.entityInfo = this.state.playerState!.entityInfo || {};
        this.state.playerState!.entityInfo!.shuffled = enable;
        this._emitState();
    }

    async musicRepeat(repeatMode: 'none' | 'one' | 'all') {
        const modes = { 'none': 1, 'one': 2, 'all': 3 };
        const mode = modes[repeatMode];

        if (this._connection !== Connection.LOCAL && mode === 1)
            return await this.mediaNext();

        await this._command({ cloud: 'на повтор', local: 'repeat', localArgs: { mode }, volume: 0 });
    }

    // ГРОМКОСТЬ

    async volumeSet(volume: number) {
        volume = Math.min(Math.max(volume, 0), 1);

        if (volume !== this.state.volume) {
            await this._command({ cloud: `громкость ${volume * 10}`, local: 'setVolume', localArgs: { volume } });
            this.state.volume = volume;
            this._emitState();
        }
    }

    async volumeUp(step: number = 0.1) {
        const volume = this.state.volume! + step;
        await this.volumeSet(volume);
    }

    async volumeDown(step: number = 0.1) {
        const volume = this.state.volume! - step;
        await this.volumeSet(volume);
    }
}