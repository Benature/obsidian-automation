import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce } from 'obsidian';
import { GenericTextSuggester } from 'src/settings/suggester/genericTextSuggester'
import { ObsidianCommand } from 'src/types/ObsidianCommand'
import { IObsidianCommand } from 'src/types/IObsidianCommand'
import { eventNames } from 'process';


enum filterKind {
	filePath = "file path in Obsidian",
	none = "none",
}
interface filterSettings {
	kind: filterKind;
	pattern: string;
}
interface eventCommandSettings {
	event: string | null;
	commands: IObsidianCommand[];
	filter: filterSettings;
}
interface AutomationPluginSettings {
	eventCommands: eventCommandSettings[];
}

const DEFAULT_SETTINGS: AutomationPluginSettings = {
	eventCommands: []
}

export default class AutomationPlugin extends Plugin {
	settings: AutomationPluginSettings;
	eventList: string[] = ["file-open", "active-leaf-change"];
	debounceUpdateAutomation = debounce(this.registerAutomation, 1000, true);

	async onload() {
		await this.loadSettings();

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

	registerAutomation() {
		for (let eventCommand of this.settings.eventCommands) {
			// console.log(eventCommand)
			if (eventCommand.commands.length == 0) { continue; }
			// @ts-ignore
			this.registerEvent(this.app.workspace.on(eventCommand.event, () => {
				// console.log("event", eventCommand)
				if (!this.eventFilter(eventCommand.filter)) {
					return;
				}
				setTimeout(() => {
					for (let command of eventCommand.commands) {
						if (command) {
							// @ts-ignore
							let r = this.app.commands.executeCommandById(command.commandId);
							// console.log(r)
						}
					}
				}, 100)
			}));
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	eventFilter(filterSetting: filterSettings) {
		switch (filterSetting.kind) {
			case filterKind.filePath:
				const path = this.app.workspace.getActiveFile()?.path;
				if (path == undefined) { return false; }
				if (path.match(new RegExp(filterSetting.pattern))) {
					return true;
				}
				break;
			case filterKind.none:
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
	private inputTextComponent: TextComponent

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

		containerEl.empty();

		for (let eventName of this.plugin.eventList) {
			let input: TextComponent;

			let eventCommand = this.plugin.settings.eventCommands.find(setting => setting.event === eventName) as eventCommandSettings;
			if (eventCommand == undefined) {
				eventCommand = { event: eventName, commands: [] } as unknown as eventCommandSettings;
				this.plugin.settings.eventCommands.push(eventCommand);
				this.plugin.saveSettings();
			}
			const I = this.plugin.settings.eventCommands.indexOf(eventCommand);

			const addEventCommandSettings = () => {
				let command = this.commands.find((v) => v.name === input.getValue());
				// let setting = this.plugin.settings.eventCommands[I] as eventCommandSettings;
				if (command == undefined) {
					this.plugin.settings.eventCommands[I].commands = [];
				} else {
					this.plugin.settings.eventCommands[I].commands[0] = command;
				}
				this.plugin.saveSettings();
				this.plugin.debounceUpdateAutomation();
				new Notice("Settings saved!")
			}

			containerEl.createEl("h4", { text: `Event on ${eventName}` });

			new Setting(containerEl)
				.setName(`Obsidian command`)
				// .setDesc("Add an Obsidian command")
				.addText((textComponent) => {
					input = textComponent;
					console.log(input)
					textComponent.setPlaceholder("Obsidian command");
					textComponent.setValue(this.plugin.settings.eventCommands[I]?.commands[0]?.name as string);
					new GenericTextSuggester(
						this.app,
						textComponent.inputEl,
						this.commands.map((c) => c.name)
					);

					textComponent.inputEl.addEventListener(
						"keypress",
						(e: KeyboardEvent) => {
							if (e.key.toLowerCase() === "enter") {
								addEventCommandSettings();
							}
						}
					);
				})
				.addButton((button) =>
					button
						.setCta()
						.setButtonText("Save")
						.onClick(() => {
							addEventCommandSettings();
						})
				);
			new Setting(containerEl)
				.setName(`Filter`)
				// .setDesc("Add an Obsidian command")
				.addDropdown(dropDown =>
					dropDown
						.addOption(filterKind.none, '-')
						.addOption(filterKind.filePath, 'file path')
						.setValue(eventCommand?.filter?.kind || filterKind.none)
						.onChange(async (value) => {
							this.plugin.settings.eventCommands[I].filter.kind = value as filterKind;
							await this.plugin.saveSettings();
						}))
				.addText((textComponent) => {
					textComponent.setPlaceholder("filter pattern");
					textComponent.setValue(eventCommand?.filter?.pattern as string)
					textComponent.onChange(async (value) => {
						this.plugin.settings.eventCommands[I].filter.pattern = value;
						await this.plugin.saveSettings();
					})

				});
			// break;
		}

		let noteEl = containerEl.createEl("p", {
			text: "Plugin needs to be reloaded after the command has been changed."
		});
		// noteEl.setAttribute("style", "color: gray; font-style: italic; margin-top: 30px;")

	}
}
