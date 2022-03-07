import Homey, { DiscoveryResultMDNSSD } from "homey";

import YandexGlagol from "../lib/glagol";
import { YandexApp, Speaker } from "../lib/types";
import Yandex from "../lib/yandex";

export default class SpeakerDevice extends Homey.Device {
    app!: YandexApp;
    yandex!: Yandex;
    glagol!: YandexGlagol;

    speaker!: Speaker;
    isLocal: boolean = false;

    image!: Homey.Image;
    latestImageUrl: string = "";

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.yandex = this.app.yandex;
        this.glagol = new YandexGlagol(this.yandex);
        this.image = await this.app.homey.images.createImage();

        await this.onDataListener();
        await this.onMultipleCapabilityListener();

        if (this.yandex.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.auth_required"));

        this.yandex.on("ready", async () => {
            await this.init();
        });

        this.yandex.on("authRequired", async () => {
            await this.setUnavailable(this.homey.__("device.auth_required"));
            this.glagol.close();
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
                    brightness: config.led.brightness.auto ? -1 : config.led.brightness.value,
                    music_equalizer_visualization: config.led.music_equalizer_visualization.auto ? "auto" : config.led.music_equalizer_visualization.style,
                    time_visualization: config.led.time_visualization.size
                });
            }
        }
        
        await this.setSettings({
            x_token: this.homey.settings.get("x_token"),
            cookies: this.homey.settings.get("cookie")
        });
    }
    
    async checkLocalConnection() {
        if (this.getData()["local_id"]) {
            const localUrl = () => `wss://${this.getStoreValue("address")}:${this.getStoreValue("port")}`;
            const updateData = (address: string, port: string) => {
                this.setStoreValue("address", address);
                this.setStoreValue("port", port);
            }
            await this.glagol.init(this.speaker, localUrl);

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
        this.glagol.on(this.getData()["id"], async data => {
            let state = data?.state;
            if (state) {
                if ("volume" in state) await this.setCapabilityValue("volume_set", state.volume * 10);
                if ("playing" in state) await this.setCapabilityValue("speaker_playing", state.playing);
                if ("subtitle" in state.playerState) await this.setCapabilityValue("speaker_artist", state.playerState.subtitle);
                if ("title" in state.playerState) await this.setCapabilityValue("speaker_track", state.playerState.title);
                if ("duration" in state.playerState) await this.setCapabilityValue("speaker_duration", state.playerState.duration);
                if ("progress" in state.playerState) await this.setCapabilityValue("speaker_position", state.playerState.progress);

                if (state.playerState?.extra?.coverURI) {
                    const url = `https://${(<string>data.state.playerState.extra.coverURI).replace("%%", "400x400")}`;
                    if (this.latestImageUrl !== url) {
                        this.image.setUrl(url);
                        await this.image.update();
                        
                        if (!this.latestImageUrl) await this.setAlbumArtImage(this.image);
                        this.latestImageUrl = url;
                    }
                }

                if (!this.getAvailable()) await this.setAvailable();
                this.isLocal = true;
            }
        });

        this.glagol.on(this.getData()["id"] + "_error", error => {
            console.log("Поймал ошибку")
            console.log(error);
            this.isLocal = false;
        });
    }

    // При изменении данных
    async onMultipleCapabilityListener() {
        this.registerCapabilityListener("volume_set", async (value) => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `громкость на ${value / 10}`);
            else await this.glagol!.send({ command: "setVolume", volume: value / 10 });
        });
        this.registerCapabilityListener("volume_up", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `громче`);
            else {
                let volume = (this.getCapabilityValue("volume_set") + 1) / 10
                if (volume <= 1) await this.glagol!.send({ command: "setVolume", volume: volume });
            }
        });
        this.registerCapabilityListener("volume_down", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, `тише`);
            else {
                let volume = (this.getCapabilityValue("volume_set") - 1) / 10
                if (volume >= 0) await this.glagol!.send({ command: "setVolume", volume: volume });
            }
        });

        this.registerCapabilityListener("speaker_playing", async (value) => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, value ? "продолжить" : "пауза");
            else await this.glagol!.send({ command: value ? "play" : "stop" });
        });
        this.registerCapabilityListener("speaker_next", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, "следующий трек");
            else await this.glagol!.send({ command: "next" });
        });
        this.registerCapabilityListener("speaker_prev", async () => {
            if (!this.isLocal) await this.yandex.scenarios.send(this.speaker, "прошлый трек");
            else await this.glagol!.send({ command: "prev" });
        });
    }

    // При удалении устройства
    async onDeleted(): Promise<void> {
        await this.glagol.close();
    }

    // При изменении настроек
    async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[]; }): Promise<string | void> {
        if (this.yandex.ready) {
            if (["yandexstation_2", "yandexmini_2"].includes(this.driver.id)) {
                let config = await this.yandex.devices.getSpeakerConfig(this.speaker);

                changedKeys.forEach(key => {
                    let value = newSettings[key];
                    if (key === "brightness") {
                        if (value === -1) config.led!.brightness.auto = true;
                        else {
                            config.led!.brightness.auto = false;
                            config.led!.brightness.value = value / 100;
                        }
                    }
                    if (key === "music_equalizer_visualization") {
                        if (value === "auto") config.led!.music_equalizer_visualization.auto = true;
                        else {
                            config.led!.music_equalizer_visualization.auto = false;
                            config.led!.music_equalizer_visualization.style = value;
                        }
                    }
                    if (key === "time_visualization") config.led!.time_visualization.size = value;
                });
    
                await this.yandex.devices.setSpeakerConfig(this.speaker, config);
            }

            if (!newSettings["x_token"] || !newSettings["cookies"]) this.yandex.emit("authRequired");
            return this.homey.__("device.save_settings");
        } else {
            throw Error(this.homey.__("device.auth_required"));
        }
    }
}