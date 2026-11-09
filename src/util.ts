import { Notice } from "obsidian";
import { TimerSettings, TimerType } from "./settings/types";

export function getTimeRemaining(settings: TimerSettings): number | null {
	const targetTime = hmString2time(settings.when[0].HM);
	if (targetTime === null) {
		new Notice(`Invalid time string "when[].HM"`);
		return null;
	}

	const now = new Date();
	switch (settings.type) {
		case TimerType.everyDay: {
			if (targetTime <= now) {
				targetTime.setDate(targetTime.getDate() + 1);
			}
			break;
		}
		case TimerType.everyWeek: {
			const weekDay = settings.when[0].weekDay ?? now.getDay();
			const days = (weekDay - targetTime.getDay() + 7) % 7;
			targetTime.setDate(targetTime.getDate() + days);
			if (targetTime <= now) {
				targetTime.setDate(targetTime.getDate() + 7);
			}
			break;
		}
		case TimerType.everyMonth: {
			const monthDay = settings.when[0].monthDay ?? 1;
			const year = targetTime.getFullYear();
			const month = targetTime.getMonth();
			for (let monthOffset = 0; monthOffset <= 12; monthOffset++) {
				targetTime.setFullYear(year, month + monthOffset, 1);
				targetTime.setDate(monthDay);
				if (targetTime > now && targetTime.getDate() === monthDay) break;
			}
			break;
		}
	}

	const remainingTime = targetTime.getTime() - now.getTime();
	return remainingTime > 0 ? remainingTime : null;
}

export function hmString2time(value: string): Date | null {
	const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
	if (match === null) return null;

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60) return null;

	const targetTime = new Date();
	targetTime.setHours(hours, minutes, 0, 0);
	return targetTime;
}

export function renderPatternTemplate(template: string, now = new Date()): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
	const replacements: Record<string, string> = {
		"{{date}}": date,
		"{{time}}": time,
		"{{datetime}}": `${date} ${time}`,
	};
	return template.replace(/\{\{(?:date|time|datetime)\}\}/g, token => replacements[token]);
}

export function ensureString2list(properties: string | string[] | null | undefined): string[] {
	if (properties === null || properties === undefined) {
		return [];
	}
	if (typeof properties === "string") {
		return properties
			.replace(/\n|^\s*,|,\s*$/g, "")
			.replace(/,,+/g, ",")
			.split(",")
			.map(property => property.trim());
	}
	return properties;
}
