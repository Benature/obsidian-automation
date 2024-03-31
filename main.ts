import { App, Editor, Debouncer, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent } from 'obsidian';
import type { EventRef } from 'obsidian'
import { GenericTextSuggester } from 'src/settings/suggester/genericTextSuggester'
import { ObsidianCommand } from 'src/types/ObsidianCommand'
import { IObsidianCommand } from 'src/types/IObsidianCommand'
import { getTimeRemaining, hourString2time } from 'src/util'


enum FilterKind {
	filePath = "file path in Obsidian",
	none = "none",
}

enum AutomationType {
	event = "event",
	interval = "interval",
	timeout = "timeout"
}
interface filterSettings {
	kind: FilterKind;
	pattern: string;
}

interface IntervalSettings {
	interval: number;
	type: IntervalType;
	when: string;
}

enum IntervalType {
	none = "none",
	everyDay = "every day",
}

interface EventSettings {
	type: EventType;
}

interface eventCommandSettings {
	id: string;
	type: AutomationType;
	commands: IObsidianCommand[];
	filter: filterSettings;
	eventSettings: EventSettings;
	timerSettings: IntervalSettings;
}

enum EventType {
	fileOpen = "file-open",
	activeLeafChange = "active-leaf-change",
	fileChange = "file-change",
}

const DefaultEventCommandSettings: eventCommandSettings = {
	id: "default-id",
	type: AutomationType.event,
	commands: [],
	filter: {
		kind: FilterKind.none,
		pattern: ""
	},
	eventSettings: {
		type: EventType.fileOpen,
	},
	timerSettings: {
		interval: 0,
		type: IntervalType.everyDay,
		when: ""
	}
}

interface AutomationPluginSettings {
	eventCommands: eventCommandSettings[];
}

const DEFAULT_SETTINGS: AutomationPluginSettings = {
	eventCommands: [DefaultEventCommandSettings],
}

export default class AutomationPlugin extends Plugin {
	settings: AutomationPluginSettings;
	eventList: string[] = ["file-open", "active-leaf-change"];
	debounceUpdateAutomation = debounce(this.updateAutomation, 1000, true);

	eventRefList: EventRef[];

	timerLog: any[] = [];
	timerSet: Set<string> = new Set(); // set of eventCommand.id
	timeoutIdSet: Set<number> = new Set(); // id from `window.setTimeout()`
	// toBeInterval: Set<string>;

	setTimer(eventCommandId: string) {
		const eventCommand = this.settings.eventCommands.find(e => e.id == eventCommandId);
		if (eventCommand == null || eventCommand.type !== AutomationType.timeout) {
			return;
		}
		// this.toBeInterval.add(eventCommand.id);
		const remainTime = getTimeRemaining(eventCommand.timerSettings.when);
		if (remainTime == null) {
			return;
		}
		if (eventCommand.commands.length == 0) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			// this.toBeInterval.delete(eventCommand.id);

			for (let command of eventCommand.commands) {
				if (command) {
					// @ts-ignore
					let r = this.app.commands.executeCommandById(command.commandId);
				}
			}
			this.setTimer(eventCommandId);
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
		console.log(`Set timeout for ${eventCommandId} when ${window.moment(new Date()).format("HH:mm")}, ${Math.ceil(remainTime / 1000 / 60)} min to run.`)
		this.timerSet.add(eventCommandId);
		this.timeoutIdSet.add(timeoutId);
		this.timerLog.push({
			id: eventCommandId,
			eventCommand: eventCommand,
			now: new Date(),
			remainTime: remainTime,
		});
		this.checkTimerStatus();
	}

	checkTimerStatus() {
		console.log("Timer Log")
		console.log(this.timerLog)
	}



	async onload() {
		await this.loadSettings();
		await this.ensureDefaultSettings;
		this.eventRefList = [];

		this.addSettingTab(new AutomationSettingTab(this.app, this));

		this.debounceUpdateAutomation();



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
				console.log("demo notice")
				console.log(new Date());
			}
		})

		// window.setInterval(() => {

		// }, 1000 * 60 * 60 * 24)


		// let a = 0;
		// window.eval("a=1;")
		// console.log(a)
		// let content = `"wawawa"`
		// const wrapping_fn = window.eval(
		// 	"(function anonymous(){" +
		// 	`return ${content};` +
		// 	"\n})"
		// );
		// console.log(wrapping_fn());
	}

	clearAutomation() {
		console.log("clear automation")
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
		this.clearAutomation();

		for (let eventCommand of this.settings.eventCommands) {
			// console.log(eventCommand)
			if (eventCommand.commands.length == 0) { continue; }

			switch (eventCommand.type) {
				case AutomationType.event:
					// @ts-ignore
					const eventRef = this.app.workspace.on(eventCommand.eventSettings.type, () => {
						// console.log("event", eventCommand)
						if (!this.eventFilter(eventCommand.filter)) {
							return;
						}
						setTimeout(() => {
							for (let command of eventCommand.commands) {
								if (command) {
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
					this.setTimer(eventCommand.id);
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async ensureDefaultSettings() {
		for (let i = 0; i < this.settings.eventCommands.length; i++) {
			this.settings.eventCommands[i] = Object.assign({}, DefaultEventCommandSettings, this.settings.eventCommands[i]);
		}
		await this.saveSettings();
	}

	eventFilter(filterSetting: filterSettings) {
		switch (filterSetting.kind) {
			case FilterKind.filePath:
				const path = this.app.workspace.getActiveFile()?.path;
				if (path == undefined) { return false; }
				if (path.match(new RegExp(filterSetting.pattern))) {
					return true;
				}
				break;
			case FilterKind.none:
				// do nothing
				return true;
			default:
				// unknown kind
				return false;
		}
	}
}


class AutomationSettingTab extends PluginSettingTab {
	plugin: AutomationPlugin;
	private commands: IObsidianCommand[] = [];
	EntriesElList: HTMLElement[];

	debounceReset;

	constructor(app: App, plugin: AutomationPlugin) {
		super(app, plugin);
		this.plugin = plugin;


		this.debounceReset = debounce(() => { plugin.debounceUpdateAutomation(); }, 1000 * 60);
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
						this.plugin.settings.eventCommands.push(DefaultEventCommandSettings);
						await this.plugin.saveSettings();
						this.display();
					});
			})

		// for (let eventName of this.plugin.eventList) {
		// 	let input: TextComponent;

		// 	let eventCommand = this.plugin.settings.eventCommands.find(setting => setting.event === eventName) as eventCommandSettings;
		// 	if (eventCommand == undefined) {
		// 		eventCommand = Object.assign({}, DefaultEventCommandSettings, { event: eventName, type: AutomationType.event });
		// 		// eventCommand = { event: eventName, type: EventType.event } as unknown as eventCommandSettings;
		// 		this.plugin.settings.eventCommands.push(eventCommand);
		// 		this.plugin.saveSettings();
		// 	}
		// 	console.log(eventCommand)
		for (let i = 0; i < this.plugin.settings.eventCommands.length; i++) {
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

		const eventCommand = this.plugin.settings.eventCommands[i];
		// const i = this.plugin.settings.eventCommands.indexOf(eventCommand);
		let input: TextComponent;
		const addEventCommandSettings = () => {
			const value = input.getValue()
			if (value.trim() === "") {
				this.plugin.settings.eventCommands[i].commands = [];
				new Notice("Command is removed!");
			}
			else {
				let command = this.commands.find((c) => c.name === value);
				// let setting = this.plugin.settings.eventCommands[I] as eventCommandSettings;
				if (command == undefined) {
					new Notice("Unknown Command!");
					return false;
				} else {
					this.plugin.settings.eventCommands[i].commands[0] = command;
				}
				new Notice("Command has been saved!")
			}
			this.plugin.saveSettings();
			this.plugin.debounceUpdateAutomation();
			return true;
		}

		switch (eventCommand.type) {
			case AutomationType.event:
				containerEl.createEl("h4", { text: `Event on ${eventCommand.eventSettings.type}` });
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
					.setValue(eventCommand.type || AutomationType.event)
					.onChange(async (value) => {
						const oldValue = eventCommand.type;
						this.plugin.settings.eventCommands[i].type = value as AutomationType;
						await this.plugin.saveSettings();
						this.debounceReset();
						if (value != oldValue) { this.displayEntry(i); }
					}))
			.addButton((button) =>
				button
					.setCta()
					.setButtonText("Delete this automation")
					// .setIcon("cross")
					.setClass("automation-delete")
					.onClick(async () => {
						this.plugin.settings.eventCommands.splice(i, 1);
						await this.plugin.saveSettings();
						this.debounceReset();
						this.display();
					})
			);
		switch (eventCommand.type) {
			case AutomationType.event:
				new Setting(containerEl)
					.setName(`Event type`)
					.addDropdown(dropDown =>
						dropDown
							.addOption(EventType.fileOpen, 'File open')
							.addOption(EventType.activeLeafChange, 'Active leaf change')
							.setValue(eventCommand.eventSettings.type || EventType.fileOpen)
							.onChange(async (value) => {
								const oldValue = eventCommand.eventSettings.type;
								this.plugin.settings.eventCommands[i].eventSettings.type = value as EventType;
								await this.plugin.saveSettings();
								this.debounceReset();
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
						.setValue(eventCommand.timerSettings.when)
						.onChange(async (value) => {
							if (hourString2time(value) != null) {
								this.plugin.settings.eventCommands[i].timerSettings.when = value;
								await this.plugin.saveSettings();
								this.debounceReset();
								whenSetting.settingEl.classList.remove("automation-invalid-input");
							} else {
								whenSetting.setClass("automation-invalid-input");
							}
						});
				});
				if (hourString2time(eventCommand.timerSettings.when) == null) {
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
				.setValue(this.plugin.settings.eventCommands[i]?.commands[0]?.name as string)
				.onChange(async (value) => {
					// @ts-ignore
					const buttonEl = commandSetting.components[1]?.buttonEl;
					if (value === this.plugin.settings.eventCommands[i]?.commands[0]?.name) {
						buttonEl.classList.add("automation-hide");
					} else {
						buttonEl.classList.remove("automation-hide");
					}
				});
			new GenericTextSuggester(
				this.app,
				textComponent.inputEl,
				this.commands.map((c) => c.name)
			);

			textComponent.inputEl.addEventListener(
				"keypress",
				(e: KeyboardEvent) => {
					if (e.key.toLowerCase() === "enter") {
						if (addEventCommandSettings()) {
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
					if (addEventCommandSettings()) {
						// @ts-ignore
						commandSetting.components[1]?.buttonEl.classList.add("automation-hide");
					}
				})

		);

		switch (eventCommand.type) {
			case AutomationType.event:
				let filterSetting = new Setting(containerEl)
					.setName(`File filter`)
					// .setDesc("Add an Obsidian command")
					.addDropdown(dropDown =>
						dropDown
							.addOption(FilterKind.none, '-')
							.addOption(FilterKind.filePath, 'File path')
							.setValue(eventCommand?.filter?.kind || FilterKind.none)
							.onChange(async (value) => {
								const oldValue = eventCommand?.filter?.kind;
								this.plugin.settings.eventCommands[i].filter.kind = value as FilterKind;
								await this.plugin.saveSettings();
								this.debounceReset();
								if (value != oldValue) { this.display(); }
							}));
				if (eventCommand.filter.kind === FilterKind.filePath) {
					filterSetting.addText((textComponent) => {
						textComponent.setPlaceholder("filter pattern");
						textComponent.setValue(eventCommand?.filter?.pattern as string)
						textComponent.onChange(async (value) => {
							console.log(i, value, this.plugin.settings.eventCommands[i])
							this.plugin.settings.eventCommands[i].filter.pattern = value;
							await this.plugin.saveSettings();
							this.debounceReset();
						})
					});
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
