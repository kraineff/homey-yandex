import Homey from 'homey';
import YandexApp from '../app';
import { Yandex } from '../yandex';
import { YandexIotSpeaker, YandexIotSpeakerState } from '../yandex/client/iot';

export default class Device extends Homey.Device {
    private _id!: string;
    private _yandex!: Yandex;
    private _speaker?: YandexIotSpeaker;
    private _waitings!: string[];
    private _image!: Homey.Image;
    private _imageUrl?: string;
    
    async onInit() {
        this._id = this.getData().id as string;
        this._yandex = (this.homey.app as YandexApp).yandex;
        this._waitings = [];

        this.getCapabilityValue('speaker_playing') ??
            await this.setCapabilityValue('speaker_playing', false);

        this._image = await this.homey.images.createImage();
        await this.setAlbumArtImage(this._image);
        this._registerCapabilities();

        await this.getSpeaker().catch(() => {});
    }

    async onDeleted() {
        const speaker = await this.getSpeaker();
        speaker.events.removeAllListeners();
    }

    async getSpeaker() {
        if (!this._speaker) {
            this._speaker = await this._yandex.iot.getSpeaker(this._id);
            this._speaker.state.volume = this.getCapabilityValue('volume_set') ?? 0;
            this._speaker.state.playing = this.getCapabilityValue('speaker_playing');
            this._speaker.events.on('state', this._handleState);
        }
        return this._speaker;
    }

    private _registerCapabilities() {
        this.registerCapabilityListener('speaker_playing', async value => {
            this._waitings.push('speaker_playing');
            const speaker = await this.getSpeaker();
            if (value) await speaker.mediaPlay();
            else await speaker.mediaPause();
        });

        this.registerCapabilityListener('volume_set', async value => {
            this._waitings.push('volume_set');
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
            this._waitings.push('speaker_shuffle');
            const speaker = await this.getSpeaker();
            await speaker.musicShuffle(value);
        });

        this.registerCapabilityListener('speaker_repeat', async value => {
            const modes = { none: 'none', track: 'one', playlist: 'all' } as any;
            const mode = modes[value];

            this._waitings.push('speaker_repeat');
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
            await speaker.mediaPower(value);
        });

        this.hasCapability('media_home') && this.registerCapabilityListener('media_home', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoHome();
        });

        this.hasCapability('media_left') && this.registerCapabilityListener('media_left', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoLeft();
        });

        this.hasCapability('media_right') && this.registerCapabilityListener('media_right', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoRight();
        });

        this.hasCapability('media_up') && this.registerCapabilityListener('media_up', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoUp();
        });

        this.hasCapability('media_down') && this.registerCapabilityListener('media_down', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoDown();
        });

        this.hasCapability('media_back') && this.registerCapabilityListener('media_back', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaGoBack();
        });

        this.hasCapability('media_click') && this.registerCapabilityListener('media_click', async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaClick();
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
                if (this._imageUrl !== newValue) {
                    this._imageUrl = newValue as string;
                    this._image.setUrl(this._imageUrl);
                    await this._image.update();
                }
                return Promise.resolve();
            }

            // Предотвращение мерцания в интерфейсе (из-за частого обновления значений)
            if (this._waitings.includes(capability)) {
                if (currentValue === newValue)
                    this._waitings = this._waitings.filter(c => c !== capability);
                return Promise.resolve();
            }

            // Установка значений
            if (currentValue !== newValue)
                await this.setCapabilityValue(capability, newValue).catch(this.error);
        });
        
        await Promise.all(promises);
    };
}