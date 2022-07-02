import Homey from "homey";
import YandexAlice from "../app";
import { Speaker } from "../lib";

export default class Device extends Homey.Device {
    app!: YandexAlice;
    device!: Speaker;

    image!: Homey.Image;
    imageUrl?: string;
    waitings!: string[];

    async onInit() {
        this.app = this.homey.app as YandexAlice;
        this.image = await this.homey.images.createImage();
        this.waitings = [];

        await this.setAlbumArtImage(this.image);

        const account = this.app.accounts.getAccount(this.getData().uid);
        if (account) {
            this.device = new Speaker({ id: this.getData().id, ...account });
            this.registerCapabilities();
            this.device.updater.on("state", this.setCapabilities);
        } else await this.setUnavailable();
    }

    async onDeleted() {
        if (this.device) this.device.updater.removeListener("state", this.setCapabilities);
    }

    registerCapabilities() {
        this.registerCapabilityListener("speaker_playing", async (value) => {
            this.waitings.push("speaker_playing");
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

    setCapabilities = async (state: any) => {
        if (this.getData().id !== state.id) return;

        const values = {
            "speaker_playing": state.playing,
            "speaker_shuffle": state.playerState?.entityInfo?.shuffled,
            "speaker_repeat": state.playerState?.entityInfo?.repeatMode,
            "speaker_album": state.playerState?.playlistId,
            "speaker_artist": state.playerState?.subtitle,
            "speaker_track": state.playerState?.title,
            "speaker_duration": state.playerState?.duration,
            "speaker_position": state.playerState?.progress,
            "volume_set": state.volume,
            "image": state.playerState?.extra?.coverURI
        };

        await Promise.all(Object.entries(values).map(async ([capability, value]) => {
            if (value === undefined) return Promise.resolve();

            if (capability === "speaker_album") value = value === "user:onyourwave" ? "Моя волна" : "";
            if (capability === "speaker_repeat") value = value === "All" ? "playlist" : (value === "One" ? "track" : "none");

            if (capability === "image") {
                if (this.imageUrl !== value) {
                    this.imageUrl = value;
                    this.image.setUrl(`https://${this.imageUrl!.replace("%%", "600x600")}`);
                    await this.image.update();
                }
                return Promise.resolve();
            }

            if (this.getSetting("progressBar")) {
                if (capability === "speaker_track") {
                    value = `${state.playerState?.subtitle} - ${state.playerState?.title}`;
                }
    
                if (capability === "speaker_artist") {
                    const size = this.getSetting("progressBarSize");
                    const duration = this.getCapabilityValue("speaker_duration");
                    const position = this.getCapabilityValue("speaker_position");
    
                    const current = Math.round((position * size) / duration);
                    value = duration ? `${"■".repeat(current)}${"□".repeat(size - current)}` : "□".repeat(size);
                }
            }

            if (this.waitings.includes(capability)) {
                if (value === this.getCapabilityValue(capability))
                    this.waitings = this.waitings.filter(c => c !== capability);
                return Promise.resolve();
            }

            if (this.getCapabilityValue(capability) !== value)
                await this.setCapabilityValue(capability, value);
        }));
    }
}