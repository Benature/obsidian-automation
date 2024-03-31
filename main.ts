import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent } from 'obsidian';
import type { EventRef } from 'obsidian'
import { GenericTextSuggester } from 'src/settings/suggester/genericTextSuggester'
import { ObsidianCommand } from 'src/types/ObsidianCommand'
import { IObsidianCommand } from 'src/types/IObsidianCommand'



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
	type: AutomationType;
	commands: IObsidianCommand[];
	filter: filterSettings;
	eventSettings: EventSettings;
	intervalSettings: IntervalSettings;
}

enum EventType {
	fileOpen = "file-open",
	activeLeafChange = "active-leaf-change",
	fileChange = "file-change",
}

const DefaultEventCommandSettings = {
	type: AutomationType.event,
	commands: [],
	filter: {
		kind: FilterKind.none,
		pattern: ""
	},
	eventSettings: {
		type: EventType.fileOpen,
	},
	intervalSettings: {
		interval: 0,
		type: IntervalType.none,
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
	debounceUpdateAutomation = debounce(this.registerAutomation, 1000, true);
	eventRefList: EventRef[];

	async onload() {
		await this.loadSettings();
		await this.ensureDefaultSettings;

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
			name: `notice for debug`,
			callback: () => {
				new Notice("notice for debug");
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
		for (let e of this.eventRefList) {
			this.app.workspace.offref(e);
		}
		this.eventRefList = [];

	}

	registerAutomation() {
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
				case AutomationType.interval:

					break;
				default:
					break;
			}
		}
	}


	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		console.log(this.settings)
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
	private inputTextComponent: TextComponent;
	EntriesElList: HTMLElement[];

	constructor(app: App, plugin: AutomationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
			.setName(`Add Automation`)
			// .setDesc(t.settingAddIconDesc)
			.addButton((button: ButtonComponent) => {
				button.setTooltip("Add new automation")
					.setButtonText("+")
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

		let noteEl = containerEl.createEl("p", {
			text: "Plugin needs to be reloaded after the command has been changed.",
			cls: "automation-bottom-desc"
		});
	}

	displayEntry(i: number): void {
		const containerEl = this.EntriesElList[i];
		containerEl.empty();

		const eventCommand = this.plugin.settings.eventCommands[i];
		// const i = this.plugin.settings.eventCommands.indexOf(eventCommand);
		let input: TextComponent;
		const addEventCommandSettings = () => {
			let command = this.commands.find((v) => v.name === input.getValue());
			// let setting = this.plugin.settings.eventCommands[I] as eventCommandSettings;
			if (command == undefined) {
				this.plugin.settings.eventCommands[i].commands = [];
			} else {
				this.plugin.settings.eventCommands[i].commands[0] = command;
			}
			this.plugin.saveSettings();
			this.plugin.debounceUpdateAutomation();
			new Notice("Command has been saved!")
			return true;
		}

		switch (eventCommand.type) {
			case AutomationType.event:
				containerEl.createEl("h4", { text: `Event on ${eventCommand.eventSettings.type}` });
				break;
			case AutomationType.interval:
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
					.addOption(AutomationType.event, 'event')
					.addOption(AutomationType.interval, 'interval')
					.setValue(eventCommand.type || AutomationType.event)
					.onChange(async (value) => {
						const oldValue = eventCommand.type;
						this.plugin.settings.eventCommands[i].type = value as AutomationType;
						await this.plugin.saveSettings();
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
								if (value != oldValue) { this.display(); }
							})

					)
				break;
			default:
				break;
		}


		let commandSetting = new Setting(containerEl)
			.setName(`Obsidian command`);
		// .setDesc("Add an Obsidian command")
		commandSetting.addText((textComponent) => {
			input = textComponent;
			// console.log(input)
			textComponent.setPlaceholder("Obsidian command");
			textComponent.setValue(this.plugin.settings.eventCommands[i]?.commands[0]?.name as string)
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
							commandSetting.components[1]?.buttonEl.add("automation-hide");
						}
					}
				}
			);
		})
		commandSetting.addButton((button) =>
			button
				.setCta()
				.setButtonText("Save")
				.setTooltip("The command is not saved yet. Click to save it.")
				.setClass("automation-hide")
				.onClick(() => {
					if (addEventCommandSettings()) {
						// @ts-ignore
						commandSetting.components[1]?.buttonEl.add("automation-hide");
					}
				})

		);

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
				})
			});
		}
	}
}
