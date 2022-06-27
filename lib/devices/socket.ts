import { Device } from "./base";

export class Socket extends Device {
    async setState(value: boolean) {
        await this.action([{
            "type": "devices.capabilities.on_off",
            "state": {
                "instance": "on",
                "value": value
            }
        }]);
    }
}