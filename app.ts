import Homey from 'homey';
import { Yandex } from './yandex';
import { YandexIotSpeaker } from './yandex/client/iot';

export default class YandexApp extends Homey.App {
    yandex!: Yandex;

    async onInit() {
        this.yandex = new Yandex({
            get: async () => JSON.parse(this.homey.settings.get('storage') || '{}'),
            set: async content => this.homey.settings.set('storage', JSON.stringify(content))
        });
        
        const mediaSayAction = this.homey.flow.getActionCard('media_say');
        mediaSayAction.registerRunListener(async args => {
            const speaker: YandexIotSpeaker = await args.device.getSpeaker();
            await speaker.actionSay(args.text, args.volume);
        });

        const mediaRunAction = this.homey.flow.getActionCard('media_run');
        mediaRunAction.registerRunListener(async args => {
            const speaker: YandexIotSpeaker = await args.device.getSpeaker();
            await speaker.actionRun(args.command, args.volume);
        });

        const updateCookie = async () => await this.yandex.request('https://ya.ru').catch(() => {});
        setInterval(updateCookie, 2.16e+7);
        await updateCookie();
    }
}

module.exports = YandexApp;