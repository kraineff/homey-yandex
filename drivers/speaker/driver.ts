import Homey from "homey";
import YandexSession from "../../lib/session";
import { YandexApp } from "../../types";

module.exports = class SpeakerDriver extends Homey.Driver {
    app!: YandexApp;
    session!: YandexSession;

    async onInit(): Promise<void> {
        this.app = <YandexApp>this.homey.app;
        this.session = this.app.session;

        this.homey.flow.getActionCard('text_to_speech').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["text"], true);
        });

        this.homey.flow.getActionCard('send_command').registerRunListener(async (args, state) => {
            await this.app.quasar.send(args.device.speaker, args["command"]);
        });
    }
    
    async onPair(pair: Homey.Driver.PairSession) {
        // pair.setHandler("list_devices", async () => {
        //     return [];
        // });

        // pair.setHandler("showView", async (view) => {
        //     console.log(view);
        //     if (view === "auth") {
        //         //@ts-ignore
        //         await pair.nextView();
        //     }
        // });
        
        // if (!(this.app.homey.settings.get("x_token") || this.app.homey.settings.get("cookie"))) {
        //     // @ts-ignore
        //     await session.showView("auth");

        //     let url = await this.app.session.getAuthUrl();
        //     console.log(url)
        //     // @ts-ignore
        //     session.emit("auth", url);

        //     let check = setInterval(async () => {
        //         let data = await this.app.session.checkAuth();
        //         if (data.status) {
        //             clearInterval(check);
        //             // @ts-ignore
        //             await session.showView("list_devices");
        //         }
        //     }, 5000);
        // }
        
        // if (this.app.homey.settings.get("x_token") || this.app.homey.settings.get("cookie")) {
        // }

        // session.setHandler("showView", async (viewId) => {
        //     if (viewId === "auth") {
        //         console.log("TEST1")
        //         //@ts-ignore
        //         await session.emit("startAuth", "URL_HERE");
        //         console.log("TEST2")
        //     }
        // });

        pair.setHandler("list_devices", async () => {
            let devices: any[] = [];
            let discoveryResult: any = this.app.discoveryStrategy.getDiscoveryResults();

            this.app.quasar.rawSpeakers().forEach(speaker => {
                let config: any = {
                    name: speaker.name,
                    data: {
                        id: speaker.id
                    },
                    icon: `/${speaker.quasar_info.platform}.svg`
                };

                if (Object.keys(discoveryResult).includes(speaker.quasar_info.device_id)) {
                    let data: any = discoveryResult[speaker.quasar_info.device_id];
                    config.data["local_id"] = data.txt.deviceid;
                    config.store = { "address": data.address, "port": data.port }
                }

                devices.push(config);
            });
            
            return devices;
        });
    }
}