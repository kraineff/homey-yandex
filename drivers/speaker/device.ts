import Homey, { DiscoveryResultMDNSSD } from "homey";

import YandexSession from "../../lib/session";
import YandexGlagol from "../../lib/glagol";
import { YandexApp, Speaker } from "../../lib/types";

module.exports = class SpeakerDevice extends Homey.Device {
    app!: YandexApp;
    session!: YandexSession;
    glagol!: YandexGlagol;

    speaker!: Speaker;
    isLocal: boolean = false;

    image!: Homey.Image;
    latestImageUrl: string = "";

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.session = this.app.session;
        this.glagol = new YandexGlagol(this.session);
        this.image = await this.app.homey.images.createImage();

        await this.onDataListener();
        await this.onMultipleCapabilityListener();

        if (!this.app.quasar.ready) await this.app.quasar.init();
        if (this.session.ready) await this.init();
        else await this.setUnavailable(this.homey.__("device.auth_required"));

        this.session.on("available", async (status) => {
            if (status) await this.init();
            else {
                await this.setUnavailable(this.homey.__("device.auth_required"));
                await this.glagol.close();
            }
        })
    }

    async init() {
        await this.setAvailable();

        let deviceId = this.getData()["id"];
        let scenarioId = this.app.quasar.scenarios.findByEncodedId(deviceId)?.id || await this.app.quasar.scenarios.add(deviceId);
        this.speaker = this.app.quasar.devices.getSpeaker(deviceId)!;
        this.speaker.quasar.scenario_id = scenarioId;

        await this.initSettings();
        await this.checkLocalConnection();
    }

    async initSettings() {
        let config = await this.app.quasar.devices.getSpeakerConfig(this.speaker);
        if (config.led) {
            await this.setSettings({
                brightness: config.led.brightness.auto ? -1 : config.led.brightness.value,
                music_equalizer_visualization: config.led.music_equalizer_visualization.auto ? "auto" : config.led.music_equalizer_visualization.style,
                time_visualization: config.led.time_visualization.size
            });
        }
    }

    async checkLocalConnection() {
        let connect = async (address: string, port: string) => {
            if (this.getStoreValue("address") !== address || this.getStoreValue("port") !== port) {
                this.setStoreValue("address", address);
                this.setStoreValue("port", port);
            }

            this.speaker = {...this.speaker, local: {
                address: this.getStoreValue("address"),
                port: this.getStoreValue("port")
            }};
            await this.glagol.init(this.speaker);
        }

        if (this.getData()["local_id"]) {
            try {
                let discoveryResult = <DiscoveryResultMDNSSD>this.app.discoveryStrategy.getDiscoveryResult(this.getData()["local_id"]);
                if (discoveryResult) await connect(discoveryResult.address, discoveryResult.port);
            } catch (e) {}
        }

        this.app.discoveryStrategy.on("result", async (discoveryResult: DiscoveryResultMDNSSD) => {
            if (discoveryResult.id === this.getData()["local_id"]) await connect(discoveryResult.address, discoveryResult.port);
        });
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
            if (!this.isLocal) await this.app.quasar.send(this.speaker, `громкость на ${value / 10}`);
            else await this.glagol!.send({ command: "setVolume", volume: value / 10 });
        });
        this.registerCapabilityListener("volume_up", async () => {
            if (!this.isLocal) await this.app.quasar.send(this.speaker, `громче`);
            else {
                let volume = (this.getCapabilityValue("volume_set") + 1) / 10
                if (volume <= 1) await this.glagol!.send({ command: "setVolume", volume: volume });
            }
        });
        this.registerCapabilityListener("volume_down", async () => {
            if (!this.isLocal) await this.app.quasar.send(this.speaker, `тише`);
            else {
                let volume = (this.getCapabilityValue("volume_set") - 1) / 10
                if (volume >= 0) await this.glagol!.send({ command: "setVolume", volume: volume });
            }
        });

        this.registerCapabilityListener("speaker_playing", async (value) => {
            if (!this.isLocal) await this.app.quasar.send(this.speaker, value ? "продолжить" : "пауза");
            else await this.glagol!.send({ command: value ? "play" : "stop" });
        });
        this.registerCapabilityListener("speaker_next", async () => {
            if (!this.isLocal) await this.app.quasar.send(this.speaker, "следующий трек");
            else await this.glagol!.send({ command: "next" });
        });
        this.registerCapabilityListener("speaker_prev", async () => {
            if (!this.isLocal) await this.app.quasar.send(this.speaker, "прошлый трек");
            else await this.glagol!.send({ command: "prev" });
        });
    }

    // При удалении устройства
    async onDeleted(): Promise<void> {
        await this.glagol.close();
    }

    // При изменении настроек
    async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[]; }): Promise<string | void> {
        if (this.session.ready) {
            let config = await this.app.quasar.devices.getSpeakerConfig(this.speaker);

            if (config.led) {
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
    
                await this.app.quasar.devices.setSpeakerConfig(this.speaker, config);
            }

            return this.homey.__("device.save_settings");
        } else {
            throw Error(this.homey.__("device.auth_required"));
        }
    }
}