import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, debounce } from 'obsidian';
import { GenericTextSuggester } from 'src/settings/suggester/genericTextSuggester'
import { ObsidianCommand } from 'src/types/ObsidianCommand'
import { IObsidianCommand } from 'src/types/IObsidianCommand'

interface eventCommandSettings {
	event: string;
	commands: IObsidianCommand[];
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
	debounceUpdateCommandWrapper = debounce(this.registerAutomation, 1000, true);

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new AutomationSettingTab(this.app, this));

		this.registerAutomation();
	}

	registerAutomation() {
		for (let eventCommand of this.settings.eventCommands) {
			if (!this.eventList.includes(eventCommand.event)) { continue; }
			// @ts-ignore
			this.registerEvent(this.app.workspace.on(eventCommand.event, () => {
				// @ts-ignore
				this.app.commands.executeCommandById(eventCommand.commands[0].commandId);
			}));
			break;

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
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class AutomationSettingTab extends PluginSettingTab {
	plugin: AutomationPlugin;
	private commands: IObsidianCommand[] = [];
	private inputTextComponent: TextComponent

	constructor(app: App, plugin: AutomationPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		this.getObsidianCommands();
	}

	private getObsidianCommands(): void {
		// @ts-ignore
		Object.keys(this.app.commands.commands).forEach((key) => {
			// @ts-ignore
			const command: { name: string; id: string } = this.app.commands.commands[key];

			this.commands.push(new ObsidianCommand(command.name, command.id));
		});
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		for (let eventName of this.plugin.eventList) {
			let input: TextComponent;

			const addEventCommandSettings = (eventName: string, command: IObsidianCommand | undefined) => {
				let setting = this.plugin.settings.eventCommands.find(s => eventName === s.event);
				if (setting == undefined) {
					setting = { event: eventName, commands: [] }
					this.plugin.settings.eventCommands.push(setting)
				}
				if (command == undefined) {
					setting.commands = [];
				} else {
					setting.commands[0] = command;
				}
				this.plugin.saveSettings();
				this.plugin.debounceUpdateCommandWrapper();
				new Notice("Settings saved!")
			}

			new Setting(containerEl)
				.setName(`On ${eventName}`)
				.setDesc("Add an Obsidian command")
				.addText((textComponent) => {
					input = textComponent;
					textComponent.inputEl.style.marginRight = "1em";
					textComponent.setPlaceholder("Obsidian command");
					textComponent.setValue(this.plugin.settings.eventCommands.find(setting => setting.event === eventName)?.commands[0]?.name as string)
					new GenericTextSuggester(
						this.app,
						textComponent.inputEl,
						this.commands.map((c) => c.name)
					);

					textComponent.inputEl.addEventListener(
						"keypress",
						(e: KeyboardEvent) => {
							if (e.key.toLowerCase() === "enter") {
								addEventCommandSettings(eventName, this.commands.find((v) => v.name === input.getValue()))
							}
						}
					);
				})
				.addButton((button) =>
					button
						.setCta()
						.setButtonText("Save")
						.onClick(() => {
							addEventCommandSettings(eventName, this.commands.find((v) => v.name === input.getValue()))
						})
				);
		}

	}
}