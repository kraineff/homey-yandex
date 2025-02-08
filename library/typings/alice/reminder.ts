import type { DayOfWeek } from ".";

export type Reminder = {
	id: string; // "00000000-00000000-00000000-00000000"
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
	trigger_policy:
		| {
				single_trigger_policy: {
					datetime: string; // "2025-01-23T01:23:45"
				};
		  }
		| {
				weekdays_trigger_policy: {
					time: string; // "01:23:45"
					day_of_week: DayOfWeek;
				};
		  };
};
