import type { AxiosInstance } from "axios";
import type { YandexStorage } from "../../storage.js";
import type * as Types from "../../typings/index.js";
import { createInstance } from "../utils.js";

export class YandexAliceAPI {
	#client: AxiosInstance;

	constructor(storage: YandexStorage) {
		this.#client = createInstance(storage, (config) => ({
			...config,
			baseURL: "https://rpc.alice.yandex.ru/gproxy",
			headers: {
				...config.headers,
				Accept: "application/json",
				Origin: "https://yandex.ru",
				"x-ya-app-type": "iot-app",
				"x-ya-application": '{"app_id":"unknown","uuid":"unknown","lang":"ru"}',
			},
		}));
	}

	get request() {
		return this.#client;
	}

	async getAlarms(deviceIds: string[]) {
		return await this.#client
			.post("/get_alarms", { device_ids: deviceIds })
			.then((res) => res.data.alarms as Types.Alarm[]);
	}

	async createAlarm(alarm: Types.Alarm, deviceType: string) {
		return await this.#client
			.post("/create_alarm", { alarm, device_type: deviceType })
			.then((res) => res.data.alarm as Types.Alarm);
	}

	async changeAlarm(alarm: Types.Alarm, deviceType: string) {
		return await this.#client
			.post("/change_alarm", { alarm, device_type: deviceType })
			.then((res) => res.data.alarm as Types.Alarm);
	}

	async cancelAlarms(deviceAlarmIds: Array<{ alarm_id: string; device_id: string }>) {
		await this.#client.post("/cancel_alarms", { device_alarm_ids: deviceAlarmIds });
	}

	async cancelAlarm(alarmId: string, deviceId: string) {
		await this.cancelAlarms([{ alarm_id: alarmId, device_id: deviceId }]);
	}

	async getReminders() {
		return await this.#client.get("/get_reminders").then((res) => res.data.reminders as Types.Reminder[]);
	}

	async createReminder(reminder: Types.Reminder) {
		await this.#client.post("/create_reminder", reminder);
	}

	async updateReminder(reminder: Types.Reminder) {
		await this.#client.post("/update_reminder", reminder);
	}

	async cancelReminders(reminderIds: string[]) {
		await this.#client.post("/cancel_reminders", {
			cancel_selected: { reminder_ids: reminderIds },
		});
	}

	async cancelReminder(reminderId: string) {
		await this.cancelReminders([reminderId]);
	}
}
