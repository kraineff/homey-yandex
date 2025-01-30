import type { AxiosInstance } from "axios";
import type { YandexStorage } from "../../storage.js";
import { createInstance } from "../utils.js";

export type YandexDayOfWeek = Array<"Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday">;

export type YandexAlarm = {
    device_id: string; // "XW000000000000000000000000000000"
    alarm_id: string;  // "00000000-00000000-00000000-00000000"
    enabled: boolean;  // true
    time: string;      // "01:23"
} & ({
    date?: string;     // "2025-01-23"
} | {
    recurring?: {
        days_of_week: YandexDayOfWeek;
    };
});

export type YandexReminder = {
    id: string;   // "00000000-00000000-00000000-00000000"
    text: string; // "Текст напоминания"
    properties: any;
    play_settings: {
        send_push: {
            state: "Enabled" | "Disabled";
        };
        play_location?: {
            selected_devices: {
                selected_device_ids: string[]; // ["XW000000000000000000000000000000"]
            };
        };
    };
    trigger_policy: {
        single_trigger_policy: {
            datetime: string; // "2025-01-23T01:23:45"
        };
    } | {
        weekdays_trigger_policy: {
            time: string; // "01:23:45"
            day_of_week: YandexDayOfWeek;
        };
    };
};

export class YandexAliceAPI {
    private client: AxiosInstance;

    constructor(storage: YandexStorage) {
        this.client = createInstance(storage, config => ({
            ...config,
            headers: {
                ...config.headers,
                "Accept": "application/json",
                "Origin": "https://yandex.ru",
                "x-ya-app-type": "iot-app",
                "x-ya-application": '{"app_id":"unknown","uuid":"unknown","lang":"ru"}',
            }
        }));
    }

    async getAlarms(deviceIds: Array<string>) {
        return await this.client
           .post("https://rpc.alice.yandex.ru/gproxy/get_alarms", { device_ids: deviceIds })
           .then(res => res.data.alarms as Array<YandexAlarm>);
    }

    async createAlarm(alarm: YandexAlarm, deviceType: string) {
        return await this.client
           .post("https://rpc.alice.yandex.ru/gproxy/create_alarm", { alarm, device_type: deviceType })
           .then(res => res.data.alarm as YandexAlarm);
    }

    async changeAlarm(alarm: YandexAlarm, deviceType: string) {
        return await this.client
            .post("https://rpc.alice.yandex.ru/gproxy/change_alarm", { alarm, device_type: deviceType })
            .then(res => res.data.alarm as YandexAlarm);
    }

    async cancelAlarms(deviceAlarmIds: Array<{ alarm_id: string, device_id: string }>) {
        await this.client
            .post("https://rpc.alice.yandex.ru/gproxy/cancel_alarms", { device_alarm_ids: deviceAlarmIds });
    }

    async cancelAlarm(alarmId: string, deviceId: string) {
        await this.cancelAlarms([{ alarm_id: alarmId, device_id: deviceId }]);
    }

    async getReminders() {
        return await this.client
            .get("https://rpc.alice.yandex.ru/gproxy/get_reminders")
            .then(res => res.data.reminders as Array<YandexReminder>);
    }

    async createReminder(reminder: YandexReminder) {
        await this.client
           .post("https://rpc.alice.yandex.ru/gproxy/create_reminder", reminder);
    }

    async updateReminder(reminder: YandexReminder) {
        await this.client
            .post("https://rpc.alice.yandex.ru/gproxy/update_reminder", reminder);
    }

    async cancelReminders(reminderIds: string[]) {
        await this.client
            .post("https://rpc.alice.yandex.ru/gproxy/cancel_reminders", { cancel_selected: { reminder_ids: reminderIds } });
    }

    async cancelReminder(reminderId: string) {
        await this.cancelReminders([reminderId]);
    }
}