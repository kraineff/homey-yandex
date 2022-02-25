import Homey from "homey";
import YandexSession from "../../lib/session";
import { YandexApp } from "../../types";

module.exports = class SpeakerDriver extends Homey.Driver {
    app!: YandexApp;
    session!: YandexSession;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.session = this.app.session;

        if (this.session.ready) {
            //@ts-ignore
            await this.app.quasarInit();
        }

        this.homey.flow.getActionCard('text_to_speech').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["text"], true);
        });

        this.homey.flow.getActionCard('send_command').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["command"]);
        });
    }
    
    onPair(pair: Homey.Driver.PairSession) {
        pair.setHandler("list_devices", async () => {
            let devices: any[] = [];
            let discoveryResult: any = this.app.discoveryStrategy.getDiscoveryResults();

            await this.app.quasar.init();
            this.app.quasar.rawSpeakers().forEach(speaker => {
                let config: any = {
                    name: speaker.name,
                    data: {
                        id: speaker.id
                    }
                };

                let icons = ["yandexmicro", "yandexmini_2", "yandexmini", "yandexstation_2", "yandexstation"];
                if (icons.includes(speaker.quasar_info.platform)) config.icon = `/${speaker.quasar_info.platform}.svg`;

                if (Object.keys(discoveryResult).includes(speaker.quasar_info.device_id)) {
                    let data: any = discoveryResult[speaker.quasar_info.device_id];
                    config.data["local_id"] = data.txt.deviceid;
                    config.store = { "address": data.address, "port": data.port }
                }

                devices.push(config);
            });
            
            return devices;
        });
        
        pair.setHandler("check", async () => {
            return await this.session.checkAuth();
        });

        pair.setHandler("start", async () => {
            return !this.session.ready ? await this.session.getAuthUrl() : "list_devices";
        });
    }
}