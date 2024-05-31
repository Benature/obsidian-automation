import { ObsidianCommand } from 'src/types/ObsidianCommand'


export enum FilterKind {
	none = "none",
	filePath = "file path in Obsidian",
	tags = "tags"
}

export enum AutomationType {
	event = "event",
	interval = "interval",
	timeout = "timeout"
}

export interface filterSettings {
	kind: FilterKind;
	pattern: string;
	modeRegExp: boolean;
	modeCode: boolean;
}

export enum WeekDay {
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday"
}

export interface TimerSettings {
	// interval: number;
	type: TimerType;
	when: {
		HM: string;
		weekDay?: number;
		monthDay?: number;
	}[];
}

export enum TimerType {
	none = "none",
	everyDay = "every day",
	everyWeek = "every week",
	everyMonth = "every month",
}

export enum EventType {
	fileOpen = "file-open",
	activeLeafChange = "active-leaf-change",
	fileChange = "file-change",
}

export interface EventSettings {
	type: EventType;
}

export  interface ActionSettings {
	id: string;
	type: AutomationType;
	enabled: boolean;
	commands: ObsidianCommand[];
	filters: filterSettings[];

	eventSetting: EventSettings;
	timerSetting: TimerSettings;

	name: string;
}

export const DefaultActionSettings: ActionSettings = {
	id: "default-id",
	type: AutomationType.event,
	enabled: true,
	commands: [],
	filters: [{
		kind: FilterKind.none,
		pattern: "",
		modeRegExp: true,
		modeCode: false,
	}],
	eventSetting: {
		type: EventType.fileOpen,
	},
	timerSetting: {
		// interval: 0,
		type: TimerType.everyDay,
		when: [{
			HM: ""
		}],
	},
	name: ""
}

export function newDefaultActionSettings() {
	return JSON.parse(JSON.stringify(DefaultActionSettings));
}

export interface AutomationPluginSettings {
	actions: ActionSettings[];
	debug: {
		console: boolean;
		writeLog: boolean;
	}
}

export const DEFAULT_SETTINGS: AutomationPluginSettings = {
	actions: [newDefaultActionSettings()],
	debug: {
		console: false,
		writeLog: false,
	}
}
