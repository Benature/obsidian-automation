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

export interface IntervalSettings {
	// interval: number;
	type: IntervalType;
	when: {
		HM: string;
		weekDay?: number;
		monthDay?: number;
	}[];
}

export enum IntervalType {
	none = "none",
	everyDay = "every day",
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
	timerSetting: IntervalSettings;

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
		type: IntervalType.everyDay,
		when: [{
			HM: ""
		}],
	},
	name: "demo"
}

export function newDefaultActionSettings() {
	return JSON.parse(JSON.stringify(DefaultActionSettings));
}
