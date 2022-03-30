import EventEmitter from "events";
import Yandex from "../../yandex";
import mdns from "multicast-dns";

export default class YandexDiscovery extends EventEmitter {
    private yandex: Yandex;
    private discovery?: mdns.MulticastDNS;
    results: any;

    constructor(yandex: Yandex) {
        super();
        this.yandex = yandex;
        this.results = {};
    }

    async init() {
        if (this.yandex.options?.debug)
            console.log("[Поиск] -> Инициализация поиска");
        
        if (this.discovery) return;
        this.discovery = mdns();
        this.discovery.addListener("response", this.handleResponse);
    }

    async close() {
        if (this.yandex.options?.debug)
            console.log("[Поиск] -> Завершение поиска");
        
        if (!this.discovery) return;
        this.discovery.removeListener("response", this.handleResponse);
        this.discovery.destroy();
    }

    private handleResponse = (response: mdns.ResponsePacket) => {
        const query = "_yandexio._tcp.local";
        const answers = [...response.answers, ...response.additionals];
        const rrPTR: any = answers.find(answer => answer.type === "PTR" && answer.name === query);
        if (!rrPTR) return;

        const result: any = {};
        answers.filter(answer => {
            if (answer.type === "SRV") result.port = answer.data.port;
            if (answer.type === "A") result.address = answer.data;
            if (answer.type === "TXT" && Array.isArray(answer.data)) {
                if (Array.isArray(answer.data)) answer.data.forEach(item => {
                    const _item = typeof item === "string" ? item : item.toString();
                    const split = _item.split("=");
                    if (split[0] === "deviceId") result.id = split[1];
                });
            }
        });
        if (Object.keys(result).length !== 3) return;

        if (!Object.keys(this.results).includes(result.id)) this.results[result.id] = result;
        else {
            const oldResult = this.results[result.id];
            if (result.address === oldResult.address && result.port === oldResult.port) return;
        }
        this.emit("result", result);
    }
}