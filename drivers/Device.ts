import Homey from 'homey';
import { YandexIotSpeaker, YandexIotSpeakerState } from '../library/client/iot';
import { Yandex } from '../library';

export default class Device extends Homey.Device {
    #id!: string;
    #yandex!: Yandex;
    #speaker?: YandexIotSpeaker;
    #waitings!: string[];
    #image!: Homey.Image;
    #imageUrl?: string;
    
    async onInit() {
        const data = this.getData();
        this.#id = data.id as string;
        this.#yandex = (this.homey.app as any).yandex;
        this.#waitings = [];

        this.getCapabilityValue('speaker_playing') ??
            await this.setCapabilityValue('speaker_playing', false);

        this.#image = await this.homey.images.createImage();
        await this.setAlbumArtImage(this.#image);
        this._registerCapabilities();

        await this.getSpeaker()
            .catch(this.error);
    }

    async onDeleted() {
        if (!this.#speaker) return;
        await this.#speaker.destroy();
    }

    async getSpeaker() {
        if (!this.#speaker) {
            this.#speaker = await this.#yandex.iot.createSpeaker(this.#id);
            this.#speaker.state.volume = this.getCapabilityValue('volume_set') ?? 0;
            this.#speaker.state.playing = this.getCapabilityValue('speaker_playing');
            this.#speaker.events.on('state', this._handleState);
        }
        return this.#speaker;
    }

    private _registerCapabilities() {
        this.registerCapabilityListener('speaker_playing', async value => {
            this.#waitings.push('speaker_playing');
            const speaker = await this.getSpeaker();
            if (value) await speaker.mediaPlay();
            else await speaker.mediaPause();
        });

        this.registerCapabilityListener('volume_set', async value => {
            this.#waitings.push('volume_set');
            const speaker = await this.getSpeaker();
            await speaker.volumeSet(value);
        });

        this.registerCapabilityListener('speaker_next', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaNext();
        });

        this.registerCapabilityListener('speaker_prev', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaPrev();
        });

        this.registerCapabilityListener('speaker_shuffle', async value => {
            this.#waitings.push('speaker_shuffle');
            const speaker = await this.getSpeaker();
            await speaker.musicShuffle(value);
        });

        this.registerCapabilityListener('speaker_repeat', async value => {
            const modes = { none: 'none', track: 'one', playlist: 'all' } as any;
            const mode = modes[value];

            this.#waitings.push('speaker_repeat');
            const speaker = await this.getSpeaker();
            await speaker.musicRepeat(mode);
        });


        this.hasCapability('media_like') && this.registerCapabilityListener('media_like', async value => {
            setTimeout(async () => await this.setCapabilityValue('media_like', false), 100);
        });

        this.hasCapability('media_dislike') && this.registerCapabilityListener('media_dislike', async value => {
            setTimeout(async () => await this.setCapabilityValue('media_dislike', false), 100);
        });

        this.hasCapability('media_power') && this.registerCapabilityListener('media_power', async value => {
            const speaker = await this.getSpeaker();
            await speaker.controlPower(value);
        });

        this.hasCapability('media_home') && this.registerCapabilityListener('media_home', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlHome();
        });

        this.hasCapability('media_left') && this.registerCapabilityListener('media_left', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlLeft();
        });

        this.hasCapability('media_right') && this.registerCapabilityListener('media_right', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlRight();
        });

        this.hasCapability('media_up') && this.registerCapabilityListener('media_up', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlUp();
        });

        this.hasCapability('media_down') && this.registerCapabilityListener('media_down', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlDown();
        });

        this.hasCapability('media_back') && this.registerCapabilityListener('media_back', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlBack();
        });

        this.hasCapability('media_click') && this.registerCapabilityListener('media_click', async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlClick();
        });
    }

    private _handleState = async (state: Partial<YandexIotSpeakerState>) => {
        const capabilities = {
            'image': state.playerState?.extra?.coverURI,
            'speaker_playing': state.playing,
            'speaker_shuffle': state.playerState?.entityInfo?.shuffled,
            'speaker_repeat': state.playerState?.entityInfo?.repeatMode,
            'speaker_artist': state.playerState?.subtitle,
            'speaker_album': state.playerState?.playlistId,
            'speaker_track': state.playerState?.title,
            'speaker_duration': state.playerState?.duration,
            'speaker_position': state.playerState?.progress,
            'volume_set': state.volume
        };
        const repeatMode = { None: 'none', One: 'track', All: 'playlist' } as any;
        capabilities.speaker_repeat = capabilities.speaker_repeat && repeatMode[capabilities.speaker_repeat];

        const imageQuality = this.getSetting('image_quality');
        capabilities.image = 'https://' + (capabilities.image || '').replace('%%', `${imageQuality}x${imageQuality}`);
        if (['LISTENING', 'SPEAKING'].includes(state.aliceState || '')) capabilities.image = 'https://i.imgur.com/vTa3rif.png';

        const promises = Object.entries(capabilities).map(async ([capability, value]) => {
            const currentValue = this.getCapabilityValue(capability);
            const newValue = value ?? null;

            // Установка обложки
            if (capability === 'image') {
                if (this.#imageUrl !== newValue) {
                    this.#imageUrl = newValue as string;
                    this.#image.setUrl(this.#imageUrl);
                    await this.#image.update();
                }
                return Promise.resolve();
            }

            // Предотвращение мерцания в интерфейсе (из-за частого обновления значений)
            if (this.#waitings.includes(capability)) {
                if (currentValue === newValue)
                    this.#waitings = this.#waitings.filter(c => c !== capability);
                return Promise.resolve();
            }

            // Установка значений
            if (currentValue !== newValue)
                await this.setCapabilityValue(capability, newValue).catch(this.error);
        });
        
        await Promise.all(promises);
    };
}