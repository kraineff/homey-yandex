import Homey, { DiscoveryResultMDNSSD } from "homey";

import YandexGlagol from "../lib/glagol";
import { YandexApp, Speaker } from "../lib/types";
import Yandex from "../lib/yandex";
import { diff } from "deep-object-diff";

export default class SpeakerDevice extends Homey.Device {
    app!: YandexApp;
    yandex!: Yandex;
    glagol!: YandexGlagol;

    speaker!: Speaker;
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

        await this.onDataListener();
        await this.onMultipleCapabilityListener();

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.reauth_required"));

        this.yandex.on("ready", async () => {
            await this.init();
        });

        this.yandex.on("reauth_required", async () => {
            await this.setUnavailable(this.homey.__("device.reauth_required"));
            this.glagol.close();
        });

        this.yandex.on("update", async data => {
            await this.setSettings({
                x_token: data.x_token,
                cookies: data.cookies
            });
        });
    }

    async init() {
        await this.setAvailable();
        
        this.speaker = this.yandex.devices.getSpeaker(this.getData()["id"])!;

        await this.initSettings();
        await this.checkLocalConnection();
    }

    async initSettings() {
        if (["yandexstation_2", "yandexmini_2"].includes(this.driver.id)) {
            let config = await this.yandex.devices.getSpeakerConfig(this.speaker);
            if (config.led) {
                await this.setSettings({
                    auto_brightness: config.led.brightness.auto,
                    brightness: config.led.brightness.value,
                    music_equalizer_visualization: config.led.music_equalizer_visualization.auto ? "auto" : config.led.music_equalizer_visualization.style,
                    time_visualization: config.led.time_visualization.size
                });
            }
        }
        
        await this.setSettings({
            x_token: this.homey.settings.get("x_token"),
            cookies: this.homey.settings.get("cookies")
        });
    }
    
    async checkLocalConnection() {
        if (this.getData()["local_id"]) {
            const localUrl = () => `wss://${this.getStoreValue("address")}:${this.getStoreValue("port")}`;
            const updateData = (address: string, port: string) => {
                this.setStoreValue("address", address);
                this.setStoreValue("port", port);
            }
            await this.glagol.init(this.speaker, localUrl).then(() => {
                this.isLocal = true;
            });

            try {
                let discoveryResult = <DiscoveryResultMDNSSD>this.app.discoveryStrategy.getDiscoveryResult(this.getData()["local_id"]);
                if (discoveryResult) updateData(discoveryResult.address, discoveryResult.port);
            } catch (e) {}

            this.app.discoveryStrategy.on("result", async (discoveryResult: DiscoveryResultMDNSSD) => {
                if (discoveryResult.id === this.getData()["local_id"]) updateData(discoveryResult.address, discoveryResult.port);
            });
        }
    }

    // При получении данных
    async onDataListener() {
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

            if (difference.volume !== undefined) await this.setCapabilityValue("volume_set", difference.volume * 10);
            if (difference.playing !== undefined) await this.setCapabilityValue("speaker_playing", difference.playing);
            if (difference.playerState?.subtitle !== undefined) await this.setCapabilityValue("speaker_artist", difference.playerState.subtitle);
            if (difference.playerState?.title !== undefined) await this.setCapabilityValue("speaker_track", difference.playerState.title);
            if (difference.playerState?.duration !== undefined) await this.setCapabilityValue("speaker_duration", difference.playerState.duration);
            if (difference.playerState?.progress !== undefined) await this.setCapabilityValue("speaker_position", difference.playerState.progress);
            if (difference.playerState?.extra?.coverURI !== undefined) {
                this.image.setUrl(`https://${(<string>difference.playerState.extra.coverURI).replace("%%", "400x400")}`);
                await this.image.update();
            }
        });
    }

    // При изменении данных
    async onMultipleCapabilityListener() {
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

        this.registerCapabilityListener("button.reauth", () => { this.yandex.emit("reauth_required") });
    }

    // При удалении устройства
    async onDeleted(): Promise<void> {
        this.glagol.close();
    }

    // При изменении настроек
    async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[]; }): Promise<string | void> {
        if (this.yandex.ready) {
            if (["yandexstation_2", "yandexmini_2"].includes(this.driver.id)) {
                const config = await this.yandex.devices.getSpeakerConfig(this.speaker);

                changedKeys.forEach(key => {
                    const value = newSettings[key];
                    if (key === "auto_brightness") config.led!.brightness.auto = value;
                    if (key === "brightness") config.led!.brightness.value = value / 100;
                    if (key === "time_visualization") config.led!.time_visualization.size = value;
                    if (key === "music_equalizer_visualization") {
                        if (value === "auto") config.led!.music_equalizer_visualization.auto = true;
                        else {
                            config.led!.music_equalizer_visualization.auto = false;
                            config.led!.music_equalizer_visualization.style = value;
                        }
                    }
                });
    
                await this.yandex.devices.setSpeakerConfig(this.speaker, config);
            }
            return this.homey.__("device.save_settings");
        }
    }
}