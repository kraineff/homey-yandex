import Yandex from "../yandex";

export class YandexMusic {
    private yandex;

    constructor(yandex: Yandex) {
        this.yandex = yandex;
    }

    async search(query: string) {
        return this.yandex.session.get("https://api.music.yandex.ru/search/suggest2", {params: { part: query }}).then(resp => {
            const result: any = {};
            resp.data.result.forEach((category: any) => result[category.type] = category.results);
            return result;
        });
    }
}