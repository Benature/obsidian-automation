import { App, Editor, Debouncer, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent, getAllTags, normalizePath } from 'obsidian';
import type { CachedMetadata, EventRef, MetadataCache } from 'obsidian'
import { CommandSuggester } from 'src/settings/suggester/genericTextSuggester'
import { ObsidianCommand } from 'src/types/ObsidianCommand'
import { IObsidianCommand } from 'src/types/IObsidianCommand'
import { ensureString2list, fromStringCode, getTimeRemaining, hourString2time } from 'src/util'
import { v4 as uuidv4 } from "uuid";
import { genFilterDesc } from 'src/settings/suggester/util';


export enum FilterKind {
	none = "none",
	filePath = "file path in Obsidian",
	tags = "tags"
}

enum AutomationType {
	event = "event",
	interval = "interval",
	timeout = "timeout"
}
interface filterSettings {
	kind: FilterKind;
	pattern: string;
	modeRegExp: boolean;
	modeCode: boolean;
}

interface IntervalSettings {
	// interval: number;
	type: IntervalType;
	when: string;
}

enum IntervalType {
	none = "none",
	everyDay = "every day",
}

enum EventType {
	fileOpen = "file-open",
	activeLeafChange = "active-leaf-change",
	fileChange = "file-change",
}

interface EventSettings {
	type: EventType;
}

export interface ActionSettings {
	id: string;
	type: AutomationType;
	enabled: boolean;
	commands: IObsidianCommand[];
	filters: filterSettings[];

	eventSetting: EventSettings;
	timerSetting: IntervalSettings;

	name: string;
}

const DefaultActionSettings: ActionSettings = {
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
		when: ""
	},
	name: "demo"
}

function newDefaultActionSettings() {
	return JSON.parse(JSON.stringify(DefaultActionSettings));
}

interface AutomationPluginSettings {
	actions: ActionSettings[];
	debug: {
		console: boolean;
		writeLog: boolean;
	}
}

const DEFAULT_SETTINGS: AutomationPluginSettings = {
	actions: [newDefaultActionSettings()],
	debug: {
		console: false,
		writeLog: false,
	}
}

export default class AutomationPlugin extends Plugin {
	settings: AutomationPluginSettings;
	eventList: string[] = ["file-open", "active-leaf-change"];
	debounceUpdateAutomation = debounce(this.updateAutomation, 1000, true);

	eventRefList: EventRef[];

	timerLog: any[] = [];
	timerSet: Set<string> = new Set(); // set of actionSetting.id
	timeoutIdSet: Set<number> = new Set(); // id from `window.setTimeout()`

	logs: string[] = [];
	logFilePath: string;

	setTimer(actionId: string) {
		const Action = this.settings.actions.find(e => e.id == actionId);
		if (Action == null || Action.type !== AutomationType.timeout || !Action.enabled) {
			return;
		}
		// this.toBeInterval.add(Action.id);
		const remainTime = getTimeRemaining(Action.timerSetting.when);
		if (remainTime == null) {
			return;
		}
		if (Action.commands.length == 0) {
			return;
		}
		const timeoutId = window.setTimeout(() => {

			for (let command of Action.commands) {
				if (command) {
					// @ts-ignore
					let r = this.app.commands.executeCommandById(command.commandId);
					this.log(`Run command:`, command)
				}
			}
			this.setTimer(actionId);
			// const intervalId = window.setInterval(() => {
			// 	for (let command of eventCommand.commands) {
			// 		if (command) {
			// 			// @ts-ignore
			// 			let r = this.app.commands.executeCommandById(command.commandId);
			// 		}
			// 	}
			// }, 1000 * 60 * 60 * 24);
			// this.timerSet.add(intervalId);
			// this.registerInterval(intervalId);


		}, remainTime);
		this.log(`Set timeout for ${actionId} when ${window.moment(new Date()).format("HH:mm")}, ${Math.ceil(remainTime / 1000 / 60)} min to run.`)
		this.timerSet.add(actionId);
		this.timeoutIdSet.add(timeoutId);
		this.timerLog.push({
			id: actionId,
			action: Action,
			now: new Date(),
			remainTime: remainTime,
		});
		this.checkTimerStatus();
	}

	checkTimerStatus() {
		this.log("Timer Log")
		this.log(this.timerLog)
	}

	test() {
		const file = this.app.workspace.getActiveFile();
		this.log(file);
		const frontmatter = this.app.metadataCache.getCache(file?.path as string)?.frontmatter
		this.log(frontmatter)
		// this.log(getAllTags(this.app.metadataCache.getCache(file?.path as string) as CachedMetadata));
	}




	async onload() {
		await this.loadSettings();
		this.eventRefList = [];
		this.logFilePath = normalizePath(this.manifest.dir + `/log-${window.moment(new Date()).format("YYYY-MM-DD HH:mm:ss")}.log`);

		this.addSettingTab(new AutomationSettingTab(this.app, this));

		this.debounceUpdateAutomation();

		// this.test();
		for (let mode of ["source", "preview"]) {
			this.addCommand({
				id: `ensure-${mode}-mode`,
				name: `Ensure ${mode} mode`,
				callback: () => {
					const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
					// @ts-ignore
					// if (activeLeaf?.currentMode.type !== mode) {
					// 	// @ts-ignore
					// 	this.app.commands.executeCommandById("markdown:toggle-preview");
					// }
					let e = activeLeaf.leaf;
					let t = e.getViewState();
					t.state.mode = mode;
					e.setViewState(t, {
						focus: !0
					})
					return;
				}
			})
		}

		this.addCommand({
			id: `notice-debug`,
			name: `demo notice`,
			callback: () => {
				new Notice("demo notice");
				console.log("demo notice", new Date());
			}
		})


	}

	clearAutomation() {
		this.log("clear automation")
		// clear eventRef for this.app.workspace
		for (let e of this.eventRefList) {
			this.app.workspace.offref(e);
		}
		this.eventRefList = [];

		// clear `window.setTimeout()`
		for (let id of this.timeoutIdSet) {
			window.clearTimeout(id);
		}
		this.timeoutIdSet.clear();
	}


	updateAutomation() {
		// this.log("updateAutomation")
		this.clearAutomation();

		for (const Action of this.settings.actions) {
			if (Action.commands.length == 0 || !Action.enabled) { continue; }

			switch (Action.type) {
				case AutomationType.event:
					// @ts-ignore
					const eventRef = this.app.workspace.on(Action.eventSetting.type, () => {
						if (!this.eventFilter(Action.filters)) {
							return;
						}
						setTimeout(() => {
							for (let command of Action.commands) {
								if (command) {
									// this.log(command)
									// @ts-ignore
									let r = this.app.commands.executeCommandById(command.commandId);
								}
							}
						}, 100)
					})
					this.eventRefList.push(eventRef);
					this.registerEvent(eventRef);
					break;
				case AutomationType.timeout:
					this.setTimer(Action.id);
					break;
				default:
					break;
			}
		}
	}


	onunload() {
		this.clearAutomation();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// await this.ensureDefaultSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// async ensureDefaultSettings() {
	// 	for (let i = 0; i < this.settings.actions.length; i++) {
	// 		this.settings.actions[i] = Object.assign({}, newDefaultActionSettings(), this.settings.actions[i]);
	// 	}
	// 	await this.saveSettings();
	// }

	eventFilter(filterSettings: filterSettings[]) {
		for (let filterSetting of filterSettings) {
			switch (filterSetting.kind) {
				case FilterKind.filePath:
					const path = this.app.workspace.getActiveFile()?.path;
					if (path == undefined) { return false; }
					let pattern: string | null = filterSetting.pattern;
					if (filterSetting.modeCode) {
						pattern = fromStringCode(pattern);
						if (pattern == null) { return false; }
					}
					if (path.match(new RegExp(pattern))) {
						continue;
						// return true;
					}
					return false;
				case FilterKind.tags:
					const file = this.app.workspace.getActiveFile();
					const frontmatter = this.app.metadataCache.getCache(file?.path as string)?.frontmatter;
					const tags = ensureString2list(frontmatter?.tags);
					const targetTags = ensureString2list(filterSetting.pattern);
					if (tags.find(t => targetTags.includes(t))) {
						continue;
					}
					return false;
				case FilterKind.none:
					// do nothing
					continue;
				default:
					// unknown kind
					return false;
			}
		}
		return true;
	}

	log(...messages: unknown[]) {
		if (this.settings.debug.console)
			console.log(...messages);
		if (!this.settings.debug.writeLog) return;
		this.logs.push(`===> [${window.moment(new Date()).format("YYYY-MM-DD HH:mm:ss")}]`);
		for (const message of messages) {
			this.logs.push(String(message));
		}
		// this.logs.push(`<=================`);
		this.app.vault.adapter.write(this.logFilePath, this.logs.join(" "));
	};
}


class AutomationSettingTab extends PluginSettingTab {
	plugin: AutomationPlugin;
	private commands: IObsidianCommand[] = [];
	EntriesElList: HTMLElement[];

	debounceResetSlowly;

	constructor(app: App, plugin: AutomationPlugin) {
		super(app, plugin);
		this.plugin = plugin;


		this.debounceResetSlowly = debounce(() => { plugin.debounceUpdateAutomation(); }, 1000 * 60);
	}

	private loadObsidianCommands(): void {
		this.commands = [];
		// @ts-ignore
		Object.keys(this.app.commands.commands).forEach((key) => {
			// @ts-ignore
			const command: { name: string; id: string } = this.app.commands.commands[key];
			this.commands.push(new ObsidianCommand(command.name, command.id));
		});
	}


	display(): void {
		this.loadObsidianCommands();
		const { containerEl } = this;

		this.EntriesElList = [];
		containerEl.empty();

		let addEntryButton = new Setting(containerEl)
			// .setName(`Add Automation`)
			// .setDesc(t.settingAddIconDesc)
			.addButton((button: ButtonComponent) => {
				button.setTooltip("Add new automation")
					.setButtonText("Add Automation")
					.setCta().onClick(async () => {
						const newActionSetting = Object.assign({}, newDefaultActionSettings(), { id: uuidv4() });
						console.log(DefaultActionSettings)
						console.log(newActionSetting)
						this.plugin.settings.actions.push(newActionSetting);
						await this.plugin.saveSettings();
						this.display();
					});
			})

		for (let i = 0; i < this.plugin.settings.actions.length; i++) {
			this.EntriesElList.push(containerEl.createDiv());
			this.displayEntry(i);
		}

		// let noteEl = containerEl.createEl("p", {
		// 	text: "Plugin needs to be reloaded after the command has been changed.",
		// 	cls: "automation-bottom-desc"
		// });
	}

	displayEntry(i: number): void {
		const containerEl = this.EntriesElList[i];
		containerEl.empty();

		const Action = this.plugin.settings.actions[i];
		let input: TextComponent;
		const addActionSettings = () => {
			const value = input.getValue()
			if (value.trim() === "") {
				this.plugin.settings.actions[i].commands = [];
				new Notice("Command is removed!");
			}
			else {
				let command = this.commands.find((c) => c.name === value);
				if (command == undefined) {
					new Notice("Unknown Command!");
					return false;
				} else {
					this.plugin.settings.actions[i].commands[0] = command;
				}
				new Notice("Command has been saved!")
			}
			this.plugin.saveSettings();
			this.plugin.debounceUpdateAutomation();
			return true;
		}

		switch (Action.type) {
			case AutomationType.event:
				containerEl.createEl("h4", { text: `Event on ${Action.eventSetting.type}` });
				break;
			case AutomationType.timeout:
				containerEl.createEl("h4", { text: `Interval` });
				break;
			default:
				containerEl.createEl("h4", { text: `Automation ${i}` });
				break;
		}

		let automationTypeSetting = new Setting(containerEl)
			.setName(`Automation type`)
			// .setDesc("Add an Obsidian command")
			.addDropdown(dropDown =>
				dropDown
					.addOption(AutomationType.event, 'Trigger')
					.addOption(AutomationType.timeout, 'Timer')
					.setValue(Action.type || AutomationType.event)
					.onChange(async (value) => {
						const oldValue = Action.type;
						this.plugin.settings.actions[i].type = value as AutomationType;
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
						if (value != oldValue) { this.displayEntry(i); }
					}))
			.addToggle((toggle) => {
				toggle.setValue(Action.enabled)
					.setTooltip("Enable / Disable this automation")
					.onChange(async (value) => {
						this.plugin.settings.actions[i].enabled = value;
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
					})
			})
			.addButton((button) =>
				button
					.setCta()
					.setButtonText("Delete this automation")
					// .setIcon("cross")
					.setClass("automation-delete")
					.onClick(async () => {
						this.plugin.settings.actions.splice(i, 1);
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
						this.display();
					})
			);
		switch (Action.type) {
			case AutomationType.event:
				new Setting(containerEl)
					.setName(`Event type`)
					.addDropdown(dropDown =>
						dropDown
							.addOption(EventType.fileOpen, 'File open')
							.addOption(EventType.activeLeafChange, 'Active leaf change')
							.setValue(Action.eventSetting.type || EventType.fileOpen)
							.onChange(async (value) => {
								const oldValue = Action.eventSetting.type;
								this.plugin.settings.actions[i].eventSetting.type = value as EventType;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								if (value != oldValue) { this.display(); }
							})

					)
				break;
			case AutomationType.timeout:
				let whenSetting = new Setting(containerEl)
					.setName(`Everyday when`)
					.setDesc(`Run commands on what time every day. (HH:MM format)`);
				whenSetting.addText((cb) => {
					cb
						.setPlaceholder(`HH:MM`)
						.setValue(Action.timerSetting.when)
						.onChange(async (value) => {
							if (hourString2time(value) != null) {
								this.plugin.settings.actions[i].timerSetting.when = value;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								whenSetting.settingEl.classList.remove("automation-invalid-input");
							} else {
								whenSetting.setClass("automation-invalid-input");
							}
						});
				});
				if (hourString2time(Action.timerSetting.when) == null) {
					whenSetting.setClass("automation-invalid-input");
				}

			default:
				break;
		}


		let commandSetting = new Setting(containerEl).setName(`Obsidian command`);
		// .setDesc("Add an Obsidian command")
		commandSetting.addText((textComponent) => {
			input = textComponent;
			// console.log(input)
			textComponent
				.setPlaceholder("Obsidian command")
				.setValue(this.plugin.settings.actions[i]?.commands[0]?.name as string)
				.onChange(async (value) => {
					// @ts-ignore
					const buttonEl = commandSetting.components[1]?.buttonEl;
					if (value === this.plugin.settings.actions[i]?.commands[0]?.name) {
						buttonEl.classList.add("automation-hide");
					} else {
						buttonEl.classList.remove("automation-hide");
					}
				});
			new CommandSuggester(
				this.app,
				textComponent.inputEl,
				this.commands.map((c) => c.name)
			);

			textComponent.inputEl.addEventListener(
				"keypress",
				(e: KeyboardEvent) => {
					if (e.key.toLowerCase() === "enter") {
						if (addActionSettings()) {
							// @ts-ignore
							commandSetting.components[1]?.buttonEl.classList.add("automation-hide");
						}
					}
				}
			);
		})
		commandSetting.setClass("automation-wide-input")
		commandSetting.addButton((button) =>
			button
				.setCta()
				.setButtonText("Save")
				.setTooltip("The command is not saved yet. Click to save it.")
				.setClass("automation-hide")
				.onClick(() => {
					if (addActionSettings()) {
						// @ts-ignore
						commandSetting.components[1]?.buttonEl.classList.add("automation-hide");
					}
				})
		);

		switch (Action.type) {
			case AutomationType.event:
				let filterSetting = new Setting(containerEl)
					.setName(`File filter`)
					.setDesc(genFilterDesc(this.plugin.settings.actions[i]))
					.addDropdown(dropDown =>
						dropDown
							.addOption(FilterKind.none, '-')
							.addOption(FilterKind.filePath, 'File path')
							.addOption(FilterKind.tags, 'Tags')
							.setValue(Action?.filters[0]?.kind || FilterKind.none)
							.onChange(async (value) => {
								const oldValue = Action?.filters[0]?.kind;
								this.plugin.settings.actions[i].filters[0].kind = value as FilterKind;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								if (value != oldValue) { this.display(); }
							}));

				if (Action.filters[0].kind !== FilterKind.none) {
					// filterSetting.setDesc("Pattern (now): " + fromStringCode(Action.filters[0].pattern));

					filterSetting.addText((textComponent) => {
						textComponent.setPlaceholder("filter pattern");
						textComponent.setValue(Action?.filters[0]?.pattern as string)
						textComponent.onChange(async (value) => {
							this.plugin.settings.actions[i].filters[0].pattern = value;
							filterSetting.setDesc(genFilterDesc(this.plugin.settings.actions[i]))
							await this.plugin.saveSettings();
							this.debounceResetSlowly();
						})
					});
				}
				if (Action.filters[0].kind === FilterKind.filePath) {
					filterSetting.addToggle((toggle) => {
						toggle.setValue(Action?.filters[0]?.modeCode)
							.setTooltip("Source code mode")
							.onChange(async (value) => {
								this.plugin.settings.actions[i].filters[0].modeCode = value;
								filterSetting.setDesc(genFilterDesc(this.plugin.settings.actions[i]))
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
							})
					})
				}
				break;
			case AutomationType.timeout:
			// new Setting(containerEl)
			// 	// .setName(`Add Automation`)
			// 	// .setDesc(t.settingAddIconDesc)
			// 	.addButton((button: ButtonComponent) => {
			// 		button.setTooltip("Set timer")
			// 			.setButtonText("Set timer")
			// 			.setCta().onClick(async () => {
			// 				this.plugin.setTimer(eventCommand.id);
			// 				// this.plugin.settings.eventCommands.push(DefaultEventCommandSettings);
			// 				// await this.plugin.saveSettings();
			// 				// this.display();
			// 			});
			// 	});
			default:
				break;
		}

	}
}
