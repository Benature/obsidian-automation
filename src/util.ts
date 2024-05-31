import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent } from 'obsidian';
import { TimerSettings, TimerType } from './settings/types';
import { assert } from 'console';


export function getTimeRemaining(settings: TimerSettings): null | number {
	console.log(settings)
	const targetTime = hmString2time(settings.when[0].HM);
	if (targetTime == null) {
		let msg = `Invalid time string "when[].HM"`;
		new Notice(msg);
		console.error(msg);
		return null;
	}
	switch (settings.type) {
		case TimerType.everyDay:
			// 如果给定的时间已经过了今天的这个时刻，计算明天的时长
			if (targetTime < new Date()) {
				targetTime.setDate(targetTime.getDate() + 1);
			}
			break;
		case TimerType.everyWeek:
			let diff = ((settings.when[0].weekDay as number) - targetTime.getDay() + 7) % 7;
			targetTime.setDate(targetTime.getDate() + diff);
			break;
		case TimerType.everyMonth:
			// todo
			let d = settings.when[0].monthDay as number;
			let m = (new Date()).getMonth();
			while (1) {
				console.log("m", m)
				targetTime.setMonth(m);
				targetTime.setDate(d);
				if (targetTime.getDate() === d && targetTime > new Date()) {
					break;
				}
				m++;
			}
			break;
	}

	console.log(targetTime);
	// // 如果给定的时间已经过了今天的这个时刻，计算明天的时长
	// if (targetTime < new Date()) {
	// 	targetTime.setDate(targetTime.getDate() + 1);
	// }

	const currentTime = new Date();
	const remainingTime = targetTime.getTime() - currentTime.getTime();
	assert(remainingTime > 0);
	console.log(remainingTime);
	return remainingTime;
}

export function hmString2time(str: string): Date | null {
	if (/\d{1,2}:\d{1,2}/.test(str)) {
		const [hours, minutes] = str.split(':').map(Number);
		if (!(hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60)) {
			let msg = `Invalid time string: ${str}`;
			// new Notice(msg);
			// console.error(msg);
			return null;
		}
		const targetTime = new Date();
		targetTime.setHours(hours);
		targetTime.setMinutes(minutes);
		targetTime.setSeconds(0);
		targetTime.setMilliseconds(0);
		return targetTime;
	}
	else {
		return null;
	}
}

export function fromStringCode(code: string): string | null {
	try {
		if (!checkStringCode(code)) {
			let msg = `Invalid string code: ${code}`;
			new Notice(msg);
			console.error(msg);
			return null;
		}
		const wrapping_fn = window.eval(
			"(function anonymous(){" +
			`return ${code};` +
			"\n})"
		);
		const res = wrapping_fn();
		return res;
	} catch (e) {
		console.error(e);
		return null;
	}
}

function checkStringCode(code: string): boolean {
	// regex check: cannot use `return`, `window`, `setTimeout`, `setInterval`, ...
	if (code.match(/[^a-zA-Z](return|window|setTimeout|setInterval)[^a-zA-Z0-9]/)) {
		return false;
	}
	return true;
}


export function ensureString2list(properties: string | string[] | null | undefined): string[] {
	if (properties === null || properties === undefined) {
		return [];
	} else if (typeof properties === "string") {
		return properties.replace(/\n|^\s*,|,\s*$/g, "").replace(/,,+/g, ",").split(",").map(p => p.trim());
	} else {
		return properties;
	}
}
