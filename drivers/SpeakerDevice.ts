import Homey, { DiscoveryResultMDNSSD } from "homey";

import { YandexApp } from "../lib/types";
import Yandex from "../lib/yandex";
import Speaker from "../lib/devices/speaker";

export default class SpeakerDevice extends Homey.Device {
    app!: YandexApp;
    yandex!: Yandex;
    speaker!: Speaker;
    image!: Homey.Image;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.yandex = this.app.yandex;
        this.image = await this.app.homey.images.createImage();
        await this.setAlbumArtImage(this.image);

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.reauth_required"));

        this.yandex.on("update", async data => await this.setSettings({ x_token: data.x_token, cookies: data.cookies }));
        this.yandex.on("ready", async () => await this.init());
        this.yandex.on("reauth_required", async () => {
            await this.setUnavailable(this.homey.__("device.reauth_required"));
            this.speaker.close();
        });
    }

    async onDeleted(): Promise<void> {
        this.speaker.close();
    }

    async init() {
        await this.setAvailable();
        
        this.speaker = new Speaker(this.yandex, this.yandex.devices.getSpeaker(this.getData().id)!);
        await this.localConnection();
        await this.initSettings();
        await this.onMultipleCapabilityListener();
    }
    
    async localConnection() {
        const discoveryResults = this.app.discoveryStrategy.getDiscoveryResults();
        if (discoveryResults && Object.keys(discoveryResults).includes(this.getData().device_id)) {
            const result = discoveryResults[this.getData().device_id];
            const url = () => `wss://${this.getStoreValue("address")}:${this.getStoreValue("port")}`;

            const update = (address: string, port: string) => {
                this.setStoreValue("address", address);
                this.setStoreValue("port", port);
            };

            this.app.discoveryStrategy.on("result", async (discoveryResult: DiscoveryResultMDNSSD) => {
                if (discoveryResult.id === this.getData().device_id) {
                    update(discoveryResult.address, discoveryResult.port);
                }
            });

            //@ts-ignore
            update(result.address, result.port);
            await this.speaker.init(url);

            this.speaker.on("update", async state => {
                console.log(state);
                const { volume, playing, playerState } = state;
                if (volume !== undefined) await this.setCapabilityValue("volume_set", volume * 10);
                if (playing !== undefined) await this.setCapabilityValue("speaker_playing", playing);
                if (playerState) {
                    const { title, subtitle, duration, progress, extra } = playerState;
                    if (title !== undefined) await this.setCapabilityValue("speaker_track", title);
                    if (subtitle !== undefined) await this.setCapabilityValue("speaker_artist", subtitle);
                    if (duration !== undefined) await this.setCapabilityValue("speaker_duration", duration);
                    if (progress !== undefined) await this.setCapabilityValue("speaker_position", progress);
                    if (extra?.coverURI !== undefined) {
                        this.image.setUrl(`https://${(<string>extra.coverURI).replace("%%", "600x600")}`);
                        await this.image.update();
                    }
                }
            });
        } else await this.speaker.init();
    }

    async onMultipleCapabilityListener() {
        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("reauth_required") });
        this.registerCapabilityListener("volume_set", async (volume) => await this.speaker.volumeSet(volume));
        this.registerCapabilityListener("volume_up", async () => await this.speaker.volumeUp(this.getCapabilityValue("volume_set")));
        this.registerCapabilityListener("volume_down", async () => await this.speaker.volumeDown(this.getCapabilityValue("volume_set")));
        this.registerCapabilityListener("speaker_playing", async (value) => value ? await this.speaker.play() : await this.speaker.pause());
        this.registerCapabilityListener("speaker_next", async () => await this.speaker.next());
        this.registerCapabilityListener("speaker_prev", async () => await this.speaker.prev());
    }

    // Настройки
    async initSettings() {
        await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
        
        if (this.speaker.settings.led) {
            const { brightness, music_equalizer_visualization, time_visualization } = this.speaker.settings.led;
            await this.setSettings({
                auto_brightness: brightness.auto,
                brightness: brightness.value,
                music_equalizer_visualization: music_equalizer_visualization.auto ? "auto" : music_equalizer_visualization.style,
                time_visualization: time_visualization.size
            })
        }
    }

    async onSettings({ newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[]; }): Promise<string | void> {
        if (this.speaker.settings.led) {
            const { brightness, music_equalizer_visualization, time_visualization } = this.speaker.settings.led;

            changedKeys.forEach(key => {
                const value = newSettings[key];
                if (key === "auto_brightness") brightness.auto = value;
                if (key === "brightness") brightness.value = value / 100;
                if (key === "time_visualization") time_visualization.size = value;
                if (key === "music_equalizer_visualization") {
                    if (value === "auto") music_equalizer_visualization.auto = true;
                    else {
                        music_equalizer_visualization.auto = false;
                        music_equalizer_visualization.style = value;
                    }
                }
            });

            await this.speaker.setSettings(this.speaker.settings);
        }

        return this.homey.__("device.save_settings");
    }
}