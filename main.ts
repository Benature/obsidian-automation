import { MarkdownView, Notice, Plugin, debounce, normalizePath } from "obsidian";
import type { EventRef } from "obsidian";
import { ensureString2list, getTimeRemaining, renderPatternTemplate } from "src/util";
import {
	ActionSettings,
	AutomationPluginSettings,
	AutomationType,
	DEFAULT_SETTINGS,
	FilterKind,
	TimerSettings,
	filterSettings,
	newDefaultActionSettings,
} from "src/settings/types";
import { AutomationSettingTab } from "src/settings/settingTab";
import { getCommandManager, onWorkspaceEvent } from "src/obsidian-internals";

interface TimerLogEntry {
	id: string;
	action: ActionSettings;
	now: Date;
	remainTime: number;
}

type LegacyTimerSettings = Omit<TimerSettings, "when"> & {
	when: TimerSettings["when"] | string;
};

export default class AutomationPlugin extends Plugin {
	settings: AutomationPluginSettings;
	eventRefList: EventRef[] = [];
	debounceUpdateAutomation = debounce(() => this.updateAutomation(), 1000, true);

	timerLog: TimerLogEntry[] = [];
	timerSet: Set<string> = new Set();
	timeoutIdSet: Set<number> = new Set();

	logs: string[] = [];
	logFilePath: string;

	setTimer(actionId: string): void {
		const action = this.settings.actions.find(item => item.id === actionId);
		if (action == null || action.type !== AutomationType.timeout || !action.enabled) return;

		const remainTime = getTimeRemaining(action.timerSetting);
		if (remainTime === null || action.commands.length === 0) return;
		if (remainTime > 2_000_000_000) {
			this.log("Timeout is too long; abandoned.");
			return;
		}

		const timeoutId = window.setTimeout(() => {
			const commands = getCommandManager(this.app);
			for (const command of action.commands) {
				if (command) {
					commands.executeCommandById(command.commandId);
					this.log("Run command:", command);
				}
			}
			this.setTimer(actionId);
		}, remainTime);

		this.log(`Set timeout for ${actionId} at ${window.moment(new Date()).format("MM-DD HH:mm")}, ${Math.ceil(remainTime / 1000 / 60)} min to run.`);
		this.timerSet.add(actionId);
		this.timeoutIdSet.add(timeoutId);
		this.timerLog.push({ id: actionId, action, now: new Date(), remainTime });
		this.checkTimerStatus();
	}

	checkTimerStatus(): void {
		this.log("Timer Log", this.timerLog);
	}

	async checkSettingsUpdate(): Promise<void> {
		let modified = false;
		for (const action of this.settings.actions) {
			const timerSetting = action.timerSetting as LegacyTimerSettings;
			if (typeof timerSetting.when === "string") {
				action.timerSetting = { ...timerSetting, when: [{ HM: timerSetting.when }] };
				modified = true;
			}
		}
		if (modified) await this.saveSettings();
	}

	onload(): void {
		void this.initialize();
	}

	private async initialize(): Promise<void> {
		await this.loadSettings();
		await this.checkSettingsUpdate();
		this.logFilePath = normalizePath(`${this.manifest.dir}/log-${window.moment(new Date()).format("YYYY-MM-DD HH:mm:ss")}.log`);
		this.addSettingTab(new AutomationSettingTab(this.app, this));
		this.debounceUpdateAutomation();

		for (const mode of ["source", "preview"]) {
			this.addCommand({
				id: `ensure-${mode}-mode`,
				name: `Ensure ${mode} mode`,
				callback: async () => {
					const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!activeView) return;
					const leaf = activeView.leaf;
					const viewState = leaf.getViewState();
					viewState.state = { ...viewState.state, mode };
					await leaf.setViewState(viewState, { focus: true });
				},
			});
		}

		this.addCommand({
			id: "notice-debug",
			name: "Demo notice",
			callback: () => new Notice("Demo notice"),
		});
	}

	clearAutomation(): void {
		this.log("Clear automation");
		for (const eventRef of this.eventRefList) this.app.workspace.offref(eventRef);
		this.eventRefList = [];
		for (const id of this.timeoutIdSet) window.clearTimeout(id);
		this.timeoutIdSet.clear();
		this.timerSet.clear();
	}

	updateAutomation(): void {
		this.log("Update automation");
		this.clearAutomation();

		for (const action of this.settings.actions) {
			if (action.commands.length === 0 || !action.enabled) continue;
			switch (action.type) {
				case AutomationType.event: {
					const eventRef = onWorkspaceEvent(this.app.workspace, action.eventSetting.type, () => {
						if (!this.eventFilter(action.filters)) return;
						window.setTimeout(() => {
							const commands = getCommandManager(this.app);
							for (const command of action.commands) {
								if (command) commands.executeCommandById(command.commandId);
							}
						}, 100);
					});
					this.eventRefList.push(eventRef);
					this.registerEvent(eventRef);
					break;
				}
				case AutomationType.timeout:
					this.setTimer(action.id);
					break;
			}
		}
	}

	onunload(): void {
		this.clearAutomation();
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<AutomationPluginSettings> | null;
		this.settings = {
			actions: data?.actions ?? [newDefaultActionSettings()],
			debug: { ...DEFAULT_SETTINGS.debug, ...data?.debug },
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	eventFilter(filters: filterSettings[]): boolean {
		for (const filter of filters) {
			switch (filter.kind) {
				case FilterKind.filePath: {
					const path = this.app.workspace.getActiveFile()?.path;
					if (path === undefined) return false;
					const pattern = filter.modeCode ? renderPatternTemplate(filter.pattern) : filter.pattern;
					try {
						if (new RegExp(pattern).test(path)) continue;
					} catch {
						new Notice(`Invalid file path regular expression: ${pattern}`);
						return false;
					}
					return false;
				}
				case FilterKind.tags: {
					const file = this.app.workspace.getActiveFile();
					const frontmatter = this.app.metadataCache.getCache(file?.path ?? "")?.frontmatter;
					const tags = ensureString2list(frontmatter?.tags as string | string[] | null | undefined);
					const targetTags = ensureString2list(filter.pattern);
					if (tags.some(tag => targetTags.includes(tag))) continue;
					return false;
				}
				case FilterKind.none:
					continue;
				default:
					return false;
			}
		}
		return true;
	}

	log(...messages: unknown[]): void {
		if (!this.settings.debug.writeLog) return;
		this.logs.push(`===> [${window.moment(new Date()).format("YYYY-MM-DD HH:mm:ss")}]`);
		for (const message of messages) this.logs.push(String(message));
		void this.app.vault.adapter.write(this.logFilePath, this.logs.join(" "));
	}
}
