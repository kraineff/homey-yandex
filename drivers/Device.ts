import Homey from "homey";
import { Yandex } from "../library/index.js";
import { YandexSpeaker } from "../library/client/home/devices/speaker.js";
import { YandexSpeakerState } from "../library/client/home/typings.js";

export default class Device extends Homey.Device {
    private id!: string;
    private yandex!: Yandex;
    private speaker?: YandexSpeaker;
    private waitings!: Record<string, number>;
    private image!: Homey.Image;
    private lastImageUrl?: string;
    private lastTrackId!: string;
    private aliceActive!: boolean;
    private lyricSeconds!: Array<string>;
    private lyricTimeout?: NodeJS.Timeout;
    
    async onInit() {
        const data = this.getData();
        this.id = data.id as string;
        this.yandex = (this.homey.app as any).yandex;
        this.waitings = {};
        this.lastTrackId = "";
        this.aliceActive = false;
        this.lyricSeconds = [];

        this.getCapabilityValue("speaker_playing") ??
            await this.setCapabilityValue("speaker_playing", false);

        this.image = await this.homey.images.createImage();
        await this.setAlbumArtImage(this.image);
        this.registerCapabilities();

        await this.getSpeaker().catch(this.error);
    }

    async onDeleted() {
        if (!this.speaker) return;
        await this.speaker.destroy();
    }

    async getSpeaker() {
        if (!this.speaker) {
            this.speaker = await this.yandex.home.createSpeaker(this.id);
            this.speaker.state.volume = this.getCapabilityValue("volume_set") ?? 0;
            this.speaker.state.playing = this.getCapabilityValue("speaker_playing");
            this.speaker.on("state", this.handleState);
            await this.speaker.connect();
        }
        return this.speaker;
    }

    private registerCapabilities() {
        this.registerCapabilityListener("speaker_playing", async value => {
            this.waitings["speaker_playing"] = Date.now();
            const speaker = await this.getSpeaker();
            if (value) await speaker.mediaPlay();
            else await speaker.mediaPause();
        });

        this.registerCapabilityListener("volume_set", async value => {
            this.waitings["volume_set"] = Date.now();
            const speaker = await this.getSpeaker();
            await speaker.volumeSet(value);
        });

        this.registerCapabilityListener("speaker_next", async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaNext();
        });

        this.registerCapabilityListener("speaker_prev", async () => {
            const speaker = await this.getSpeaker();
            await speaker.mediaPrev();
        });

        this.registerCapabilityListener("speaker_shuffle", async value => {
            this.waitings["speaker_shuffle"] = Date.now();
            const speaker = await this.getSpeaker();
            await speaker.musicShuffle(value);
        });

        this.registerCapabilityListener("speaker_repeat", async value => {
            const modes = { none: "none", track: "one", playlist: "all" } as any;
            const mode = modes[value];

            this.waitings["speaker_repeat"] = Date.now();
            const speaker = await this.getSpeaker();
            await speaker.musicRepeat(mode);
        });

        this.registerCapabilityListener("media_rewind", async value => {
            this.waitings["media_rewind"] = Date.now();
            const speaker = await this.getSpeaker();
            await speaker.mediaRewind(value);
        });

        this.registerCapabilityListener("media_lyrics", async value => {
            const speaker = await this.getSpeaker();
            await speaker.mediaRewind(Number(value));
            clearTimeout(this.lyricTimeout);
            this.lyricTimeout = undefined;
        });

        this.hasCapability("media_like") && this.registerCapabilityListener("media_like", async value => {
            setTimeout(async () => await this.setCapabilityValue("media_like", false), 100);
        });

        this.hasCapability("media_dislike") && this.registerCapabilityListener("media_dislike", async value => {
            setTimeout(async () => await this.setCapabilityValue("media_dislike", false), 100);
        });

        this.hasCapability("media_power") && this.registerCapabilityListener("media_power", async value => {
            const speaker = await this.getSpeaker();
            await speaker.controlPower(value);
        });

        this.hasCapability("media_home") && this.registerCapabilityListener("media_home", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlHome();
        });

        this.hasCapability("media_left") && this.registerCapabilityListener("media_left", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlLeft();
        });

        this.hasCapability("media_right") && this.registerCapabilityListener("media_right", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlRight();
        });

        this.hasCapability("media_up") && this.registerCapabilityListener("media_up", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlUp();
        });

        this.hasCapability("media_down") && this.registerCapabilityListener("media_down", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlDown();
        });

        this.hasCapability("media_back") && this.registerCapabilityListener("media_back", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlBack();
        });

        this.hasCapability("media_click") && this.registerCapabilityListener("media_click", async () => {
            const speaker = await this.getSpeaker();
            await speaker.controlClick();
        });
    }

    private handleState = async (state: Partial<YandexSpeakerState>) => {
        const trackId = state.playerState?.id || "";
        const lastTrackId = this.lastTrackId + "";
        this.lastTrackId = trackId;

        const capabilities: Record<string, any> = {
            "speaker_playing": state.playing,
            "speaker_shuffle": state.playerState?.entityInfo?.shuffled,
            "speaker_repeat": state.playerState?.entityInfo?.repeatMode,
            "speaker_duration": state.playerState?.duration,
            "speaker_position": state.playerState?.progress,
            "volume_set": state.volume,
            "media_rewind": Math.round(state.playerState?.progress || 0)
        };

        if (trackId !== "" && trackId !== lastTrackId) {
            const track = await this.yandex.api.music.getTrack(trackId);
            const trackImage = track.coverUri || track.ogImage || state.playerState?.extra?.coverURI;

            if (trackImage) {
                const imageQuality = this.getSetting("image_quality");
                this.lastImageUrl = "https://" + trackImage.replace("%%", `${imageQuality}x${imageQuality}`);
                this.image.setUrl(this.lastImageUrl);
                await this.image.update();
            }
            
            this.lyricSeconds = [];
            await this.setCapabilityOptions("media_lyrics", { values: [] });

            if (track.lyricsInfo.hasAvailableSyncLyrics) {
                const lyrics = await this.yandex.api.music.getLyrics(trackId)
                    .then(lyrics => {
                        const lyricsLines: string[] = lyrics.split("\n");
                        return lyricsLines.map(line => {
                            const time = line.split("[")[1].split("] ")[0];
                            const timeColons = time.split(":").map(c => Number(c));
                            const timeSeconds = String((timeColons[0] * 60) + timeColons[1]);
                            this.lyricSeconds.push(timeSeconds);

                            const text = line.replace(`[${time}] `, "") || "-";
                            return { id: timeSeconds, title: text };
                        });
                    })
                    .catch(console.error);
                await this.setCapabilityOptions("media_lyrics", { values: lyrics });
            }

            capabilities["speaker_track"] = track.title || state.playerState?.title;
            capabilities["speaker_artist"] = track.artists?.map((a: any) => a.name)?.join(", ") || state.playerState?.subtitle;
            capabilities["speaker_album"] = track.albums?.[0]?.title || state.playerState?.playlistId;
        }

        const repeatMode = { None: "none", One: "track", All: "playlist" } as any;
        capabilities.speaker_repeat = capabilities.speaker_repeat && repeatMode[capabilities.speaker_repeat];

        const rewindOptions = this.getCapabilityOptions("media_rewind");
        if (capabilities.speaker_duration && capabilities.speaker_duration !== rewindOptions.max) {
            await this.setCapabilityOptions("media_rewind", { min: 0, max: capabilities.speaker_duration, step: 1 });
        }

        if (capabilities.speaker_position && this.lyricSeconds.length) {
            const position = capabilities.speaker_position;
            const closest = this.lyricSeconds.find(s => Number(s) >= position) || this.lyricSeconds[0];
            const between = Number(closest) - position;

            if (between > 0 && !this.lyricTimeout) {
                this.lyricTimeout = setTimeout(async () => {
                    this.lyricTimeout = undefined;
                    this.lyricSeconds.includes(closest) &&
                        await this.setCapabilityValue("media_lyrics", closest).catch(this.error);
                }, between * 1000);
            }
        }

        const aliceState = state.aliceState || "";
        if (!this.aliceActive && (aliceState === "LISTENING" || aliceState === "SPEAKING")) {
            const handle = async (state: Partial<YandexSpeakerState>) => {
                if (state.aliceState !== "IDLE") return;

                this.aliceActive = false;
                this.speaker!.off("state", handle);
                this.image.setUrl(this.lastImageUrl!);
                await this.image.update();
            };

            this.aliceActive = true;
            this.speaker!.on("state", handle);
            this.image.setUrl("https://i.imgur.com/vTa3rif.png");
            await this.image.update();
        }

        await Promise.all(
            Object.entries(capabilities).map(async ([capability, value]) => {
                const capabilityValue = this.getCapabilityValue(capability);
                const stateValue = value ?? null;

                if (Object.keys(this.waitings).includes(capability)) {
                    if (Date.now() - this.waitings[capability] >= 3000)
                        delete this.waitings[capability];
                    return Promise.resolve();
                }

                if (capabilityValue !== stateValue)
                    await this.setCapabilityValue(capability, stateValue).catch(this.error);
            })
        );
    };
}