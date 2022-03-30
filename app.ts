import Homey from "homey";
import YandexSpeaker from "./lib/modules/devices/types/speaker";
import Yandex from "./lib/yandex";

module.exports = class YandexAlice extends Homey.App {
    yandex!: Yandex;

    async onInit() {
        this.yandex = new Yandex({ debug: true });
        
        this.yandex.on("update", data => {
            Object.keys(data).forEach(key => {
                console.log(`[Приложение] -> Сохранение ${key}`);
                this.homey.settings.set(key, data[key])
            });
        });
        
        this.yandex.on("close", () => {
            ["x_token", "cookies", "music_token"].forEach(key => {
                console.log(`[Приложение] -> Удаление ${key}`);
                this.homey.settings.set(key, "");
            });
        });

        await this.yandex.login(
            this.homey.settings.get("x_token"),
            this.homey.settings.get("cookies"),
            this.homey.settings.get("music_token")
        );

        // Действие: Произнести текст
        this.homey.flow.getActionCard("say_tts").registerRunListener((args, state) => {
            const speaker: YandexSpeaker = args.device.device;
            return speaker.say(args.text, args.volume !== "-1" ? +args.volume : undefined);
        });

        // Действие: Выполнить команду
        this.homey.flow.getActionCard("send_command").registerRunListener(async (args, state) => {
            const speaker: YandexSpeaker = args.device.device;
            return speaker.run(args.command);
        });

        // Действие: Включить музыку
        const playMediaAction = this.homey.flow.getActionCard("play_media");
        playMediaAction.registerRunListener((args, state) => args.device.device.run(args.search.command));
        playMediaAction.registerArgumentAutocompleteListener("search", async (query, args) => {
            const types: any = {
                artist: ["ИСПОЛНИТЕЛИ", "исполнителя"], album: ["АЛЬБОМЫ", "альбом"], track: ["ТРЕКИ", "трек"],
                podcast: ["ПОДКАСТЫ", "подкаст"], "podcast-episode": ["ВЫПУСКИ ПОДКАСТОВ", "выпуск подкаста"],
                playlist: ["ПЛЕЙЛИСТЫ", "плейлист"]
            }

            const search = await this.yandex.session.get("https://api.music.yandex.ru/search/suggest2", {
                params: { part: query }
            }).then(resp => resp.data);

            let result: any[] = [];
            search.result.forEach((category: any) => {
                const { type, results } = category;

                result.push({ description: types[type][0] });
                results.forEach((item: any) => {
                    const data = item[Object.keys(item)[1]];
                    result.push({
                        command: `Включи ${types[type][1]} ${item.text}`,
                        name: data.title || data.name,
                        ...(data.artists && { description: data.artists.map((artist: any) => artist.name).join(", ") }),
                        ...((data.ogImage || data.coverUri) && { image: `https://${(data.ogImage || data.coverUri).replace("%%", "600x600")}` })
                    });
                });
            });
            
            return <any>result;
        });
    }
}