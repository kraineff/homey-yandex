import Socket from '../../../utils/socket';
import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import { YandexAPI } from '../../../api';
import { YandexIotUpdater } from '../updater';
import { YandexIotSpeakerState } from '../types';
import { strictJsonParse } from '../../../utils/json';

type CommandParams = {
    /** Облачная команда (текст) */
    cloud?: string;
    /** Облачный инстанс (для TTS - phrase_action) */
    cloudInstance?: string;
    /** Локальная команда */
    local?: string;
    /** Локальные аргументы */
    localArgs?: Object;
    /** Громкость выполнения команды (от 0 до 1) */
    volume?: number;
};

enum AliceState {
    Idle = 'IDLE',
    Speaking = 'SPEAKING'
};

enum Connection {
    Local = 0,
    Cloud = 1,
    CloudOnly = 2
};

export class YandexIotSpeaker {
    events: EventEmitter;
    state: Partial<YandexIotSpeakerState>;

    #connection: number;
    #glagolSocket: Socket;
    #glagolPlatform: string;
    #glagolToken?: string;

    constructor(readonly id: string, private api: YandexAPI, private updater: YandexIotUpdater) {
        this.events = new EventEmitter();
        this.#connection = Connection.Cloud;
        this.state = { volume: 0.5, playing: false };
        
        const quasarDevice = this.updater.getDevice(id);
        const quasarInfo = quasarDevice.quasar_info;
        const glagolId = quasarInfo.device_id;
        this.#glagolPlatform = quasarInfo.platform;

        this.#glagolSocket = new Socket({
            address: async () => {
                const glagolDevices = await this.api.iot.getGlagolDevices();
                const glagolDevice = glagolDevices.find((device: any) => device.id === glagolId)!;
                
                if (!glagolDevice.networkInfo) {
                    this.#connection = Connection.Cloud;
                    throw new Error('Нет локального управления');
                }

                const glagolAddress = glagolDevice.networkInfo.ip_addresses[0];
                const glagolPort = glagolDevice.networkInfo.external_port;

                this.#glagolToken = await this.api.iot.getGlagolToken(quasarInfo.device_id, quasarInfo.platform);
                return `wss://${glagolAddress}:${glagolPort}`;
            },
            options: {
                rejectUnauthorized: false
            },
            closeCodes: [],
            heartbeat: 10,
            message: {
                transform: payload => ({
                    id: randomUUID(), sentTime: Date.now(),
                    conversationToken: this.#glagolToken,
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
                    await this.#glagolSocket.send({ command: 'softwareVersion' });
                    this.#connection = Connection.Local;
                },
                close: () => {
                    this.#connection = Connection.Cloud;
                },
                message: async (message) => {
                    const state = message.state;
                    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
                    this.state = state;
                    this.#updateState();
                }
            }
        });

        this.#glagolSocket.open()
            .catch(console.log);
    }

    /**
     * Ручное обновление состояния (для облачных колонок)
     */
    #updateState() {
        this.events.emit('state', this.state);
    }

    /**
     * Облачное действие
     * @param instance - инстанс
     * @param value - значение
     */
    async #cloudAction(instance: string, value: any) {
        return await this.api.iot.runDeviceAction(this.id, [{
            type: 'devices.capabilities.quasar.server_action',
            state: { instance, value }
        }]);
    }

    /**
     * Универсальный метод вызова команды (облачной или локальной)
     * @param params - параметры
     */
    async #command(params: CommandParams) {
        if ((params.volume === undefined) ||
            (params.local !== undefined && this.#connection === Connection.Local))
            return await this.#simpleCommand(params);
        
        await this.#volumeCommand(params);
    }

    /**
     * Выполнение простой команды (облачной или локальной)
     * @param params - параметры
     */
    async #simpleCommand(params: Omit<CommandParams, 'volume'>) {
        const { cloud, cloudInstance, local, localArgs } = params;

        const cloudWrapper = async () =>
            cloud && await this.#cloudAction(cloudInstance ?? 'text_action', cloud);
        
        if (!local || this.#connection === Connection.CloudOnly)
            return await cloudWrapper();

        await this.#glagolSocket.send({ command: local, ...(localArgs || {}) })
            .catch(cloudWrapper);
    }

    /**
     * Выполнение сложной команды с изменением громкости (облачной или локальной)
     * @param params - параметры
     */
    async #volumeCommand(params: CommandParams) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const { volume, ...command } = params;
                const currentVolume = this.state.volume!;
                const currentPlaying = this.state.playing!;
                const bringBack = async () => {
                    await this.volumeSet(currentVolume);
                    if (currentPlaying) await this.mediaPlay();
                    resolve();
                };

                await this.mediaPause();
                await this.volumeSet(volume!);
                await this.#simpleCommand(command);

                // В облачном режиме все команды идут по очереди, поэтому сразу возвращаем
                if (this.#connection !== Connection.Local)
                    return await bringBack();

                // В локальном режиме ждем, когда Алиса договорит
                let aliceState: string;
                const handleState = async (state: YandexIotSpeakerState) => {
                    if ((aliceState === AliceState.Speaking && state.aliceState !== aliceState) ||
                        (aliceState === AliceState.Idle && state.aliceState === AliceState.Idle)) {
                            this.events.off('state', handleState);
                            await bringBack();
                        }
                    aliceState = state.aliceState;
                };
                this.events.on('state', handleState);
            } catch (e) { reject(e) }
        });
    }

    /**
     * Произнести текст
     * @param message - текст
     * @param volume - громкость (от 0 до 1)
     */
    async actionSay(message: string, volume?: number) {
        volume = volume ?? this.state.volume;
        await this.#command({ cloud: message, cloudInstance: 'phrase_action', volume });
    }

    /**
     * Выполнение текстовой команды
     * @param command - команда
     * @param volume - громкость (от 0 до 1)
     */
    async actionRun(command: string, volume?: number) {
        volume = volume ?? this.state.volume;
        await this.#command({ cloud: command, volume });
    }

    /**
     * Управление выбор
     */
    async controlClick() {
        await this.#command({ cloud: 'нажми', local: 'control', localArgs: { action: 'click_action' } });
    }

    /**
     * Управление вверх
     */
    async controlUp() {
        await this.#command({ cloud: 'вверх', local: 'control', localArgs: { action: 'go_up' } });
    }

    /**
     * Управление вниз
     */
    async controlDown() {
        await this.#command({ cloud: 'вниз', local: 'control', localArgs: { action: 'go_down' } });
    }

    /**
     * Управление влево
     */
    async controlLeft() {
        await this.#command({ cloud: 'влево', local: 'control', localArgs: { action: 'go_left' } });
    }

    /**
     * Управление вправо
     */
    async controlRight() {
        await this.#command({ cloud: 'вправо', local: 'control', localArgs: { action: 'go_right' } });
    }

    /**
     * Управление домой
     */
    async controlHome() {
        await this.#command({ cloud: 'домой' });
    }

    /**
     * Управление назад
     */
    async controlBack() {
        await this.#command({ cloud: 'назад' });
    }

    /**
     * Питание телевизора
     * @param enable - включено
     */
    async controlPower(enable: boolean) {
        await this.#command({
            cloud: (enable && 'включи' || 'выключи') + 'телевизор',
            volume: 0
        });
    }
    
    /**
     * Воспроизведение медиаконтента
     */
    async mediaPlay() {
        if (this.state.playing) return;
        await this.#command({ cloud: 'играй', local: 'play' });

        // Облачный фоллбэк
        this.state.playing = true;
        this.#updateState();
    }

    /**
     * Остановка медиаконтента
     */
    async mediaPause() {
        if (!this.state.playing) return;
        await this.#command({ cloud: 'стоп', local: 'stop' });

        // Облачный фоллбэк
        this.state.playing = false;
        this.#updateState();
    }

    /**
     * Перемотка медиаконтента
     * @param position - позиция
     */
    async mediaRewind(position: number) {
        await this.#command({ local: 'rewind', localArgs: { position } });
    }

    /**
     * Следующий медиаконтент
     */
    async mediaNext() {
        await this.#command({ cloud: 'следующий', local: 'next' });

        // Облачный фоллбэк
        this.state.playing = true;
        this.#updateState();
    }

    /**
     * Предыдущий медиаконтент
     */
    async mediaPrev() {
        await this.#command({ cloud: 'предыдущий', local: 'prev' });
        
        // Облачный фоллбэк
        this.state.playing = true;
        this.#updateState();
    }

    /**
     * Режим перемешки треков
     * @param enable - включено
     */
    async musicShuffle(enable: boolean) {
        if (this.state.playerState?.entityInfo.shuffled === enable) return;
        await this.#command({ cloud: 'перемешай', local: 'shuffle', localArgs: { enable }, volume: 0 });

        // Облачный фоллбэк
        this.state.playerState = this.state.playerState || {} as any;
        this.state.playerState!.entityInfo = this.state.playerState!.entityInfo || {};
        this.state.playerState!.entityInfo!.shuffled = enable;
        this.#updateState();
    }

    /**
     * Режим повтора трека или плейлиста
     * @param repeatMode - режим повтора (none - нет, one - трек, all - плейлист)
     */
    async musicRepeat(repeatMode: 'none' | 'one' | 'all') {
        const modes = { 'none': 1, 'one': 2, 'all': 3 };
        const mode = modes[repeatMode];

        // В облачном режиме переключаемся на следующий трек,
        // если режим повтора 'none'
        if (this.#connection !== Connection.Local && mode === 1)
            return await this.mediaNext();

        await this.#command({ cloud: 'на повтор', local: 'repeat', localArgs: { mode }, volume: 0 });
    }

    /**
     * Установка громкости
     * @param volume - громкость (от 0 до 1)
     */
    async volumeSet(volume: number) {
        volume = Math.min(Math.max(volume, 0), 1);

        if (volume === this.state.volume) return;
        if (this.#glagolPlatform === 'yandexmodule_2') volume *= 10;

        await this.#command({ cloud: `громкость ${volume * 10}`, local: 'setVolume', localArgs: { volume } });
        
        // Облачный фоллбэк
        this.state.volume = volume;
        this.#updateState();
    }

    /**
     * Повышение громкости
     * @param step - шаг (от 0 до 1)
     */
    async volumeUp(step: number = 0.1) {
        const volume = this.state.volume! + step;
        await this.volumeSet(volume);
    }

    /**
     * Понижение громкости
     * @param step - шаг (от 0 до 1)
     */
    async volumeDown(step: number = 0.1) {
        const volume = this.state.volume! - step;
        await this.volumeSet(volume);
    }
}