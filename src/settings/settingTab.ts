import {
	App,
	ButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	TextComponent,
	debounce,
} from "obsidian";
import AutomationPlugin from "main";
import { ObsidianCommand } from "src/types/ObsidianCommand";
import { v4 as uuidv4 } from "uuid";
import { hmString2time } from "src/util";
import { getCommandManager } from "src/obsidian-internals";
import { CommandSuggester } from "./suggester/genericTextSuggester";
import { genFilterDesc } from "./suggester/util";
import {
	AutomationType,
	EventType,
	FilterKind,
	TimerType,
	newDefaultActionSettings,
} from "./types";

export class AutomationSettingTab extends PluginSettingTab {
	plugin: AutomationPlugin;
	private commands: ObsidianCommand[] = [];
	private entriesElList: HTMLElement[] = [];
	private debounceResetSlowly: () => void;

	constructor(app: App, plugin: AutomationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.debounceResetSlowly = debounce(() => plugin.debounceUpdateAutomation(), 1000 * 60);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			name: "Automation settings",
			render: (_setting, group) => this.renderSettings(group.listEl),
		}];
	}

	private loadObsidianCommands(): void {
		const commands = getCommandManager(this.app).commands;
		this.commands = Object.values(commands).map(command => new ObsidianCommand(command.name, command.id));
	}

	renderSettings(containerEl: HTMLElement): void {
		this.loadObsidianCommands();
		this.entriesElList = [];
		containerEl.empty();

		new Setting(containerEl).addButton((button: ButtonComponent) => {
			button.setTooltip("Add new automation")
				.setButtonText("Add automation")
				.setCta()
				.onClick(async () => {
					const action = Object.assign({}, newDefaultActionSettings(), { id: uuidv4() });
					this.plugin.settings.actions.push(action);
					await this.plugin.saveSettings();
					this.update();
				});
		});

		for (let i = 0; i < this.plugin.settings.actions.length; i++) {
			this.entriesElList.push(containerEl.createDiv());
			this.renderEntry(i);
		}

		new Setting(containerEl).setName("Advanced").setHeading();
		new Setting(containerEl)
			.setName("Write log file")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.debug.writeLog)
					.setTooltip("Write automation logs to a vault file")
					.onChange(async value => {
						this.plugin.settings.debug.writeLog = value;
						await this.plugin.saveSettings();
					});
			});
	}

	renderEntry(i: number): void {
		const containerEl = this.entriesElList[i];
		containerEl.empty();
		const action = this.plugin.settings.actions[i];
		let input: TextComponent;
		let saveButtonEl: HTMLElement | undefined;

		const addActionSettings = (): boolean => {
			const value = input.getValue();
			if (value.trim() === "") {
				this.plugin.settings.actions[i].commands = [];
				new Notice("Command removed.");
			} else {
				const command = this.commands.find(item => item.name === value);
				if (command === undefined) {
					new Notice("Unknown command.");
					return false;
				}
				this.plugin.settings.actions[i].commands[0] = command;
				new Notice("Command saved.");
			}
			void this.plugin.saveSettings();
			this.plugin.debounceUpdateAutomation();
			return true;
		};

		switch (action.type) {
			case AutomationType.event:
				new Setting(containerEl).setName(`Event on ${action.eventSetting.type}`).setHeading();
				break;
			case AutomationType.timeout:
				new Setting(containerEl).setName("Timer").setHeading();
				break;
			default:
				new Setting(containerEl).setName(`Automation ${i}`).setHeading();
				break;
		}

		const automationTypeSetting = new Setting(containerEl)
			.setName("Automation type")
			.addDropdown(dropdown => {
				dropdown.addOption(AutomationType.event, "Trigger")
					.addOption(AutomationType.timeout, "Timer (experimental)")
					.setValue(action.type || AutomationType.event)
					.onChange(async value => {
						const newType = value as AutomationType;
						const oldType = action.type;
						this.plugin.settings.actions[i].type = newType;
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
						if (newType !== oldType) this.renderEntry(i);
					});
			})
			.addToggle(toggle => {
				toggle.setValue(action.enabled)
					.setTooltip("Enable or disable this automation")
					.onChange(async value => {
						this.plugin.settings.actions[i].enabled = value;
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
					});
			})
			.addButton(button => {
				button.setCta()
					.setButtonText("Delete this automation")
					.setClass("automation-delete")
					.onClick(async () => {
						this.plugin.settings.actions.splice(i, 1);
						await this.plugin.saveSettings();
						this.plugin.debounceUpdateAutomation();
						this.update();
					});
			});

		if (action.type === AutomationType.timeout) {
			automationTypeSetting.setDesc("Timer is an experimental feature.");
		}

		switch (action.type) {
			case AutomationType.event: {
				new Setting(containerEl)
					.setName("Event type")
					.addDropdown(dropdown => {
						dropdown.addOption(EventType.fileOpen, "File open")
							.addOption(EventType.activeLeafChange, "Active leaf change")
							.setValue(action.eventSetting.type || EventType.fileOpen)
							.onChange(async value => {
								const newType = value as EventType;
								const oldType = action.eventSetting.type;
								this.plugin.settings.actions[i].eventSetting.type = newType;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								if (newType !== oldType) this.update();
							});
					});
				break;
			}
			case AutomationType.timeout: {
				new Setting(containerEl)
					.setName("Timer type")
					.addDropdown(dropdown => {
						dropdown.addOption(TimerType.everyDay, "Every day")
							.addOption(TimerType.everyWeek, "Every week")
							.addOption(TimerType.everyMonth, "Every month")
							.setValue(action.timerSetting.type || TimerType.everyDay)
							.onChange(async value => {
								const newType = value as TimerType;
								const oldType = action.timerSetting.type;
								this.plugin.settings.actions[i].timerSetting.type = newType;
								if (newType === TimerType.everyWeek && action.timerSetting.when[0].weekDay === undefined) {
									this.plugin.settings.actions[i].timerSetting.when[0].weekDay = 0;
								}
								if (newType === TimerType.everyMonth && action.timerSetting.when[0].monthDay === undefined) {
									this.plugin.settings.actions[i].timerSetting.when[0].monthDay = 1;
								}
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
								if (newType !== oldType) this.renderEntry(i);
							});
					});

				const whenSetting = new Setting(containerEl)
					.setName("Time")
					.setDesc(`Run commands at the configured time (${action.timerSetting.type}). Use HH:MM format.`);
				switch (action.timerSetting.type) {
					case TimerType.everyWeek: {
						whenSetting.addDropdown(dropdown => {
							dropdown.addOption("1", "Monday")
								.addOption("2", "Tuesday")
								.addOption("3", "Wednesday")
								.addOption("4", "Thursday")
								.addOption("5", "Friday")
								.addOption("6", "Saturday")
								.addOption("0", "Sunday")
								.setValue((action.timerSetting.when[0].weekDay ?? 0).toString())
								.onChange(async value => {
									this.plugin.settings.actions[i].timerSetting.when[0].weekDay = Number(value);
									await this.plugin.saveSettings();
									this.plugin.debounceUpdateAutomation();
								});
						});
						break;
					}
					case TimerType.everyMonth: {
						whenSetting.addDropdown(dropdown => {
							dropdown.addOption("1", "1st").addOption("2", "2nd").addOption("3", "3rd");
							for (let day = 4; day <= 31; day++) dropdown.addOption(day.toString(), `${day}th`);
							dropdown.setValue((action.timerSetting.when[0].monthDay ?? 1).toString());
							dropdown.onChange(async value => {
								this.plugin.settings.actions[i].timerSetting.when[0].monthDay = Number(value);
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
							});
						});
						break;
					}
				}
				whenSetting.addText(component => {
					component.setPlaceholder("HH:MM")
						.setValue(action.timerSetting.when[0].HM)
						.onChange(async value => {
							if (hmString2time(value) !== null) {
								this.plugin.settings.actions[i].timerSetting.when[0].HM = value;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								whenSetting.settingEl.classList.remove("automation-invalid-input");
							} else {
								whenSetting.setClass("automation-invalid-input");
							}
						});
				});
				if (hmString2time(action.timerSetting.when[0].HM) === null) {
					whenSetting.setClass("automation-invalid-input");
				}
				break;
			}
		}

		const commandSetting = new Setting(containerEl).setName("Command name");
		commandSetting.addText(component => {
			input = component;
			component.setPlaceholder("Obsidian command")
				.setValue(action.commands[0]?.name ?? "")
				.onChange(value => {
					saveButtonEl?.classList.toggle("automation-hide", value === action.commands[0]?.name);
				});
			new CommandSuggester(this.app, component.inputEl, this.commands.map(command => command.name));
			component.inputEl.addEventListener("keypress", (event: KeyboardEvent) => {
				if (event.key.toLowerCase() === "enter" && addActionSettings()) {
					saveButtonEl?.classList.add("automation-hide");
				}
			});
		});
		commandSetting.setClass("automation-wide-input");
		commandSetting.addButton(button => {
			saveButtonEl = button.buttonEl;
			button.setCta()
				.setButtonText("Save")
				.setTooltip("The command is not saved yet. Click to save it.")
				.setClass("automation-hide")
				.onClick(() => {
					if (addActionSettings()) saveButtonEl?.classList.add("automation-hide");
				});
		});

		switch (action.type) {
			case AutomationType.event: {
				const filterSetting = new Setting(containerEl)
					.setName("File filter")
					.setDesc(genFilterDesc(action))
					.addDropdown(dropdown => {
						dropdown.addOption(FilterKind.none, "-")
							.addOption(FilterKind.filePath, "File path")
							.addOption(FilterKind.tags, "Tags")
							.setValue(action.filters[0]?.kind || FilterKind.none)
							.onChange(async value => {
								const newKind = value as FilterKind;
								const oldKind = action.filters[0]?.kind;
								this.plugin.settings.actions[i].filters[0].kind = newKind;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								if (newKind !== oldKind) this.update();
							});
					});

				if (action.filters[0].kind !== FilterKind.none) {
					filterSetting.addText(component => {
						component.setPlaceholder("Filter pattern")
							.setValue(action.filters[0]?.pattern ?? "")
							.onChange(async value => {
								this.plugin.settings.actions[i].filters[0].pattern = value;
								filterSetting.setDesc(genFilterDesc(this.plugin.settings.actions[i]));
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
							});
					});
				}
				if (action.filters[0].kind === FilterKind.filePath) {
					filterSetting.addToggle(toggle => {
						toggle.setValue(action.filters[0]?.modeCode)
							.setTooltip("Use {{date}}, {{time}}, or {{datetime}} templates")
							.onChange(async value => {
								this.plugin.settings.actions[i].filters[0].modeCode = value;
								filterSetting.setDesc(genFilterDesc(this.plugin.settings.actions[i]));
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
							});
					});
				}
				break;
			}
			case AutomationType.timeout:
				break;
		}
	}
}
