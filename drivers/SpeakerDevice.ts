import Homey, { DiscoveryResultMDNSSD } from "homey";

import YandexGlagol from "../lib/glagol";
import { Device, YandexApp } from "../lib/types";
import Yandex from "../lib/yandex";
import { diff } from "deep-object-diff";

export default class SpeakerDevice extends Homey.Device {
    app!: YandexApp;
    yandex!: Yandex;
    glagol!: YandexGlagol;

    speaker!: Device;
    isLocal: boolean = false;
    lastState: any = {};

    waitForIdle: boolean = false;
    savedVolumeLevel?: number;

    image!: Homey.Image;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.yandex = this.app.yandex;
        this.glagol = new YandexGlagol(this.yandex);
        this.image = await this.app.homey.images.createImage();
        await this.setAlbumArtImage(this.image);

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.reauth_required"));

        this.yandex.on("update", async data => await this.setSettings({ x_token: data.x_token, cookies: data.cookies }));
        this.yandex.on("ready", async () => await this.init());
        this.yandex.on("reauth_required", async () => {
            await this.setUnavailable(this.homey.__("device.reauth_required"));
            this.glagol.close();
        });
    }

    async onDeleted(): Promise<void> {
        this.glagol.close();
    }

    async init() {
        await this.setAvailable();
        
        this.speaker = this.yandex.devices.getSpeaker(this.getData().id)!;
        await this.onMultipleCapabilityListener();
        await this.initSettings();
        await this.localConnection();
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
            await this.glagol.init(this.speaker, url).then(() => this.isLocal = true);

            this.glagol.on(this.getData()["id"], async state => {
                delete state.timeSinceLastVoiceActivity;
                delete state.playerState.duration;
                delete state.playerState.progress;
                const difference: any = diff(this.lastState, state);
                if (!Object.keys(difference).length) return;
                this.lastState = state;
    
                if (this.lastState.aliceState === "LISTENING" && this.waitForIdle) {
                    if (this.savedVolumeLevel !== undefined) this.glagol.send({ command: "setVolume", volume: this.savedVolumeLevel });
                    this.waitForIdle = false;
                }
                
                const { volume, playing, playerState } = difference;
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
        }
    }

    async onMultipleCapabilityListener() {
        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("reauth_required") });
        
        this.registerCapabilityListener("volume_set", async (value) => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `громкость на ${value / 10}`);
            else this.glagol.send({ command: "setVolume", volume: value / 10 });
        });
        this.registerCapabilityListener("volume_up", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `громче`);
            else {
                let volume = (this.getCapabilityValue("volume_set") + 1) / 10
                if (volume <= 1) this.glagol.send({ command: "setVolume", volume: volume });
            }
        });
        this.registerCapabilityListener("volume_down", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `тише`);
            else {
                let volume = (this.getCapabilityValue("volume_set") - 1) / 10
                if (volume >= 0) this.glagol.send({ command: "setVolume", volume: volume });
            }
        });
        this.registerCapabilityListener("speaker_playing", async (value) => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, value ? "продолжить" : "пауза");
            else this.glagol.send({ command: value ? "play" : "stop" });
        });
        this.registerCapabilityListener("speaker_next", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, "следующий трек");
            else this.glagol.send({ command: "next" });
        });
        this.registerCapabilityListener("speaker_prev", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, "прошлый трек");
            else this.glagol.send({ command: "prev" });
        });
    }

    // Настройки
    async initSettings() {
        await this.setSettings({ x_token: this.homey.settings.get("x_token"), cookies: this.homey.settings.get("cookies") });
        
        if (["yandexstation_2", "yandexmini_2"].includes(this.driver.id)) {
            const config = await this.yandex.devices.getSpeakerConfig(this.speaker);
            const { brightness, music_equalizer_visualization, time_visualization } = config.led!;
            if (config.led) {
                await this.setSettings({
                    auto_brightness: brightness.auto,
                    brightness: brightness.value,
                    music_equalizer_visualization: music_equalizer_visualization.auto ? "auto" : music_equalizer_visualization.style,
                    time_visualization: time_visualization.size
                });
            }
        }
    }

    async onSettings({ newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[]; }): Promise<string | void> {
        if (["yandexstation_2", "yandexmini_2"].includes(this.driver.id)) {
            const config = await this.yandex.devices.getSpeakerConfig(this.speaker);
            const { brightness, music_equalizer_visualization, time_visualization } = config.led!;

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
            
            await this.yandex.devices.setSpeakerConfig(this.speaker, config);
            return this.homey.__("device.save_settings");
        }
    }
}