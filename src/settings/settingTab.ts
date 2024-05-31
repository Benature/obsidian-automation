import { App, Editor, Debouncer, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce, ButtonComponent, getAllTags, normalizePath } from 'obsidian';

import AutomationPlugin from 'main';
import { ObsidianCommand } from 'src/types/ObsidianCommand';
import { v4 as uuidv4 } from "uuid";
import { hmString2time } from 'src/util';
import { CommandSuggester } from './suggester/genericTextSuggester';
import { genFilterDesc } from './suggester/util';
import { ActionSettings, AutomationType, FilterKind, newDefaultActionSettings, filterSettings, DefaultActionSettings, EventType, TimerType, WeekDay } from './types';


export class AutomationSettingTab extends PluginSettingTab {
	plugin: AutomationPlugin;
	private commands: ObsidianCommand[] = [];
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
						// console.log(DefaultActionSettings)
						// console.log(newActionSetting)
						this.plugin.settings.actions.push(newActionSetting);
						await this.plugin.saveSettings();
						this.display();
					});
			})

		for (let i = 0; i < this.plugin.settings.actions.length; i++) {
			this.EntriesElList.push(containerEl.createDiv());
			this.displayEntry(i);
		}

		let headingEl = containerEl.createEl("h1", { text: `Advanced settings` });
		new Setting(containerEl)
			.setName(`Debug console log`)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.debug.console)
					.setTooltip("Enable / Disable console logging")
					.onChange(async (value) => {
						this.plugin.settings.debug.console = value;
						await this.plugin.saveSettings();
					})
			})

		// let noteEl = containerEl.createEl("p", {
		// 	text: "Plugin needs to be reloaded after the command has been changed.",
		// 	cls: "automation-bottom-desc"
		// });
	}

	displayEntry(i: number): void {
		const containerEl = this.EntriesElList[i];
		containerEl.empty();

		const Action = this.plugin.settings.actions[i];
		// console.log(Action);
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
				let headingEl = containerEl.createEl("h4", { text: `Event on ${Action.eventSetting.type}` });
				headingEl.empty();
				headingEl.append(
					createEl("span", { text: `Event on ` }),
					createEl("code", { text: `${Action.eventSetting.type}` }),
				)
				break;
			case AutomationType.timeout:
				containerEl.createEl("h4", { text: `Timer` });
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
					.addOption(AutomationType.timeout, 'Timer (Experimental)')
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
			case AutomationType.timeout:
				automationTypeSetting.setDesc(`Timer is an experimental feature.`)
				break;
		}
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
				new Setting(containerEl)
					.setName(`Timer type`)
					.addDropdown(dropDown =>
						dropDown
							.addOption(TimerType.everyDay, 'Every day')
							.addOption(TimerType.everyWeek, 'Every week')
							.addOption(TimerType.everyMonth, 'Every month')
							.setValue(Action.timerSetting.type || TimerType.everyDay)
							.onChange(async (value) => {
								const oldValue = Action.type;
								this.plugin.settings.actions[i].timerSetting.type = value as TimerType;
								switch (value) {
									case TimerType.everyWeek:
										if (Action.timerSetting.when[0].weekDay == undefined) {
											this.plugin.settings.actions[i].timerSetting.when[0].weekDay = 0;
										}
										break;
									case TimerType.everyMonth:
										if (Action.timerSetting.when[0].monthDay == undefined) { 
											this.plugin.settings.actions[i].timerSetting.when[0].monthDay = 1;
										}
										break;
								}
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
								if (value != oldValue) {
									this.displayEntry(i);
								}
							}))
				let whenSetting = new Setting(containerEl)
					.setName(`Time`)
					.setDesc(`Run commands on what time ${Action.timerSetting.type}. (HH:MM format)`);
				switch (this.plugin.settings.actions[i].timerSetting.type) {
					case TimerType.everyWeek:
						whenSetting.addDropdown(dropDown =>
							dropDown
								.addOption("1", 'Monday')
								.addOption("2", 'Tuesday')
								.addOption("3", 'Wednesday')
								.addOption("4", 'Thursday')
								.addOption("5", 'Friday')
								.addOption("6", 'Saturday')
								.addOption("0", 'Sunday')
								.setValue(this.plugin.settings.actions[i].timerSetting.when[0].weekDay?.toString() || "0")
								.onChange(async (value) => {
									const oldValue = Action.type;
									this.plugin.settings.actions[i].timerSetting.when[0].weekDay = parseInt(value);
									await this.plugin.saveSettings();
									this.plugin.debounceUpdateAutomation();
									if (value != oldValue) {
										this.displayEntry(i);
									}
								}))
						break;
					case TimerType.everyMonth:
						whenSetting.addDropdown(dropDown => {
							dropDown
								.addOption("1", '1st')
								.addOption("2", '2nd')
								.addOption("3", '3rd')
							for (let i = 4; i <= 31; i++) {
								dropDown.addOption(i.toString(), i.toString()+"th");
							}
							dropDown.setValue(this.plugin.settings.actions[i].timerSetting.when[0].monthDay?.toString() || "1")
							dropDown.onChange(async (value) => {
								const oldValue = Action.type;
								this.plugin.settings.actions[i].timerSetting.when[0].monthDay = parseInt(value);
								await this.plugin.saveSettings();
								this.plugin.debounceUpdateAutomation();
								if (value != oldValue) {
									this.displayEntry(i);
								}
							})
							return dropDown;
						})
						break;
				}
				whenSetting.addText((cb) => {
					cb
						.setPlaceholder(`HH:MM`)
						.setValue(Action.timerSetting.when[0].HM)
						.onChange(async (value) => {
							if (hmString2time(value) != null) {
								this.plugin.settings.actions[i].timerSetting.when[0].HM = value;
								await this.plugin.saveSettings();
								this.debounceResetSlowly();
								whenSetting.settingEl.classList.remove("automation-invalid-input");
							} else {
								whenSetting.setClass("automation-invalid-input");
							}
						});
				});
				if (hmString2time(Action.timerSetting.when[0].HM) == null) {
					whenSetting.setClass("automation-invalid-input");
				}

			default:
				break;
		}


		let commandSetting = new Setting(containerEl).setName(`Command name`);
		// .setDesc("Add an Obsidian command")
		commandSetting.addText((textComponent) => {
			input = textComponent;
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
