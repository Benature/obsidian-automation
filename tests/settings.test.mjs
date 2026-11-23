import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

let tempDir;
let AutomationSettingTab;

before(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "automation-settings-"));
	const outfile = join(tempDir, "settings.mjs");
	await build({
		entryPoints: ["src/settings/settingTab.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [{
			name: "settings-test-stubs",
			setup(builder) {
				builder.onResolve({ filter: /^(?:obsidian|uuid)$/ }, args => ({ path: args.path, namespace: "stub" }));
				builder.onResolve({ filter: /(?:obsidian-internals|genericTextSuggester|suggester\/util)$/ }, args => ({ path: args.path, namespace: "stub" }));
				builder.onLoad({ filter: /^obsidian$/, namespace: "stub" }, () => ({
					contents: `export class PluginSettingTab {} export class Setting {} export class ButtonComponent {}
						export class Notice {} export class TextComponent {} export const debounce = fn => fn;`,
					loader: "js",
				}));
				builder.onLoad({ filter: /^uuid$/, namespace: "stub" }, () => ({ contents: "export const v4 = () => 'test-id';", loader: "js" }));
				builder.onLoad({ filter: /(?:obsidian-internals|genericTextSuggester|suggester\/util)$/, namespace: "stub" }, args => ({
					contents: args.path.endsWith("obsidian-internals")
						? "export const getCommandManager = () => ({ commands: {} });"
						: args.path.endsWith("genericTextSuggester")
							? "export class CommandSuggester {}"
							: "export const genFilterDesc = () => '';",
					loader: "js",
				}));
			},
		}],
	});
	({ AutomationSettingTab } = await import(pathToFileURL(outfile).href));
});

after(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

test("settings render into the row preserved by Obsidian 1.15", () => {
	const tab = Object.create(AutomationSettingTab.prototype);
	const setting = { settingEl: { id: "setting-row" } };
	const group = { listEl: { id: "host-managed-group-list" } };
	let renderedTo;
	tab.renderSettings = containerEl => { renderedTo = containerEl; };

	const [definition] = tab.getSettingDefinitions();
	definition.render(setting, group);

	assert.equal(renderedTo, setting.settingEl);
	assert.notEqual(renderedTo, group.listEl);
});
