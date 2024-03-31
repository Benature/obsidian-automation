import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent } from 'obsidian';


export function getTimeRemaining(givenTime: string) {
	const targetTime = hourString2time(givenTime);
	if (targetTime == null) {
		let msg = `Invalid time string "When"`;
		new Notice(msg);
		console.error(msg);
		return null;
	}

	// 如果给定的时间已经过了今天的这个时刻，计算明天的时长
	if (targetTime < new Date()) {
		targetTime.setDate(targetTime.getDate() + 1);
	}

	const currentTime = new Date();
	const remainingTime = targetTime.getTime() - currentTime.getTime();
	return remainingTime
}

export function hourString2time(str: string): Date | null {
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

export function fromStringCode(code: string): string {
	const wrapping_fn = window.eval(
		"(function anonymous(){" +
		`return ${code};` +
		"\n})"
	);
	const res = wrapping_fn();
	return res;
}
