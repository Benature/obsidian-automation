import type { App, EventRef, Workspace } from "obsidian";

export interface CommandDefinition {
	id: string;
	name: string;
}

interface CommandManager {
	commands: Record<string, CommandDefinition>;
	executeCommandById(id: string): boolean;
}

export function getCommandManager(app: App): CommandManager {
	return (app as App & { commands: CommandManager }).commands;
}

export function onWorkspaceEvent(workspace: Workspace, event: string, callback: () => void): EventRef {
	return (workspace as unknown as {
		on(event: string, callback: () => void): EventRef;
	}).on(event, callback);
}
