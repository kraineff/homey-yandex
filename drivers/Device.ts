import Homey from "homey";
import YandexAlice from "../app";
import { Speaker } from "../lib";

export default class Device extends Homey.Device {
    app!: YandexAlice;
    device!: Speaker;

    image?: Homey.Image;
    waitings!: string[];

    async onInit() {
        this.app = this.homey.app as YandexAlice;
        this.waitings = [];

        const imageUrl = this.getStoreValue("imageUrl");
        if (imageUrl) await this.makeImage(imageUrl);

        const account = await this.app.accounts.getAccount(this.getData().uid);
        if (account) {
            this.device = new Speaker({ id: this.getData().id, api: account.api, updater: account.updater });
            this.registerCapabilities();
            this.device.updater.on("state", this._handleState);
        } else await this.setUnavailable();
    }

    async onDeleted() {
        if (this.device) this.device.updater.removeListener("state", this._handleState);
    }

    registerCapabilities() {
        this.registerCapabilityListener("speaker_playing", async (value) => {
            this.waitings.push("speaker_playing");
            if (!this.getCapabilityValue("speaker_track")) return await this.device.playMusic("user:onyourwave", "Radio");
            value ? await this.device.play() : await this.device.pause();
        });
        this.registerCapabilityListener("volume_set", async (volume) => {
            this.waitings.push("volume_set");
            await this.device.volumeSet(volume);
        });

        this.registerCapabilityListener("volume_up", async () => await this.device.volumeUp());
        this.registerCapabilityListener("volume_down", async () => await this.device.volumeDown());
        this.registerCapabilityListener("speaker_next", async () => await this.device.next());
        this.registerCapabilityListener("speaker_prev", async () => await this.device.prev());
        this.registerCapabilityListener("speaker_shuffle", async (value) => {
            this.waitings.push("speaker_shuffle");
            await this.device.shuffle(value);
        });
        this.registerCapabilityListener("speaker_repeat", async (value) => {
            this.waitings.push("speaker_repeat");
            const modes = { "none": "none", "track": "one", "playlist": "all" };
            //@ts-ignore
            await this.device.repeat(modes[value]);
        });
    }

    private _handleState = async (state: any) => {
        if (this.getData().id !== state.id) return;

        const capabilities = {
            "image": state.playerState?.extra?.coverURI,
            "speaker_playing": state.playing,
            "speaker_shuffle": state.playerState?.entityInfo?.shuffled,
            "speaker_repeat": state.playerState?.entityInfo?.repeatMode,
            "speaker_artist": state.playerState?.subtitle,
            "speaker_album": state.playerState?.playlistId,
            "speaker_track": state.playerState?.title,
            "speaker_duration": state.playerState?.duration,
            "speaker_position": state.playerState?.progress,
            "volume_set": state.volume,
        };

        const playlists = {
            "user:onyourwave": "Моя волна"
        };

        const repeatMode = {
            "None": "none",
            "One": "track",
            "All": "playlist"
        };

        const promises = Object.entries(capabilities).map(async ([capability, value]) => {
            if (capability === "image") {
                if (!this.image && value) await this.makeImage(value).catch(this.error);
                else if (this.image && value) await this.updateImage(value).catch(this.error);
                else if (this.image && !value) await this.deleteImage().catch(this.error);
                return Promise.resolve();
            }
            
            if (!(value === undefined || value === null)) {
                if (capability === "speaker_album")
                    value = value in playlists ? playlists[value as keyof typeof playlists] : value;
                if (capability === "speaker_repeat")
                    value = repeatMode[value as keyof typeof repeatMode]; 
            } else value = null;

            // Предотвращение мерцания в интерфейсе (из-за частого обновления значений)
            if (this.waitings.includes(capability)) {
                if (value === this.getCapabilityValue(capability))
                    this.waitings = this.waitings.filter(c => c !== capability);
                return Promise.resolve();
            }
            
            // Установка значений
            if (this.getCapabilityValue(capability) !== value)
                await this.setCapabilityValue(capability, value).catch(this.error);
        });

        await Promise.all(promises);
    }

    async makeImage(url: string) {
        if (this.image) return;
        this.image = await this.homey.images.createImage();
        this.image.setUrl(`https://${url.replace("%%", "600x600")}`);
        await this.setAlbumArtImage(this.image);
        await this.setStoreValue("imageUrl", url);
    }

    async updateImage(url: string) {
        if (!this.image) return;
        if (this.getStoreValue("imageUrl") !== url) {
            this.image.setUrl(`https://${url.replace("%%", "600x600")}`);
            await this.image.update();
            await this.setStoreValue("imageUrl", url);
        }
    }

    async deleteImage() {
        if (!this.image) return;
        await this.image.unregister();
        this.image = undefined;
        this.unsetStoreValue("imageUrl");
    }
}