import type { DayOfWeek } from ".";

export type Alarm = {
	device_id: string; // "XW000000000000000000000000000000"
	alarm_id: string; // "00000000-00000000-00000000-00000000"
	enabled: boolean; // true
	time: string; // "01:23"
} & (
	| {
			date?: string; // "2025-01-23"
	  }
	| {
			recurring?: {
				days_of_week: DayOfWeek;
			};
	  }
);
