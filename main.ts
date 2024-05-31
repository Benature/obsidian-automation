import { MarkdownView, Notice, Plugin, debounce, normalizePath } from 'obsidian';
import type { EventRef } from 'obsidian'
import { ensureString2list, fromStringCode, getTimeRemaining } from 'src/util'
import { ActionSettings, AutomationType, FilterKind, newDefaultActionSettings, filterSettings, AutomationPluginSettings, DEFAULT_SETTINGS } from 'src/settings/types';
import {AutomationSettingTab} from 'src/settings/settingTab'




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
		const remainTime = getTimeRemaining(Action.timerSetting);
		if (remainTime == null) {
			return;
		}
		if (Action.commands.length == 0) {
			return;
		}
		if (remainTime > 2000000000) {
			// too long timeout
			this.log("too long timeout, abandoned.")
			return;
		}
		const timeoutId = window.setTimeout(() => {
			for (let command of Action.commands) {
				if (command) {
					// @ts-ignore
					let r = this.app.commands.executeCommandById(command.commandId);
					console.log(r)
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

		this.log(`Set timeout for ${actionId} when ${window.moment(new Date()).format("mm-DD HH:mm")}, ${Math.ceil(remainTime / 1000 / 60)} min to run.`)
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


	async checkSettingsUpdate() {
		let modified = false;
		for (let i = 0;  i< this.settings.actions.length; i++) { 
			if (typeof this.settings.actions[i].timerSetting.when === "string") {
				console.log(this.settings.actions[i].timerSetting)
				// @ts-ignore
				this.settings.actions[i].timerSetting.when = [{ HM: this.settings.actions[i].timerSetting.when as string }]
				modified = true;
			}
		}
		if (modified) {
			await this.saveSettings();
		}
}

	async onload() {
		await this.loadSettings();
		await this.checkSettingsUpdate();
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
		this.log("updateAutomation")
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
