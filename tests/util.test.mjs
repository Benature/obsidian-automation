import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

let tempDir;
let ensureString2list;
let getTimeRemaining;
let hmString2time;
let renderPatternTemplate;

before(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "automation-util-"));
	const outfile = join(tempDir, "util.mjs");
	await build({
		entryPoints: ["src/util.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [{
			name: "obsidian-stub",
			setup(builder) {
				builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
				builder.onLoad({ filter: /^obsidian$/, namespace: "stub" }, () => ({
					contents: "export class Notice { constructor(message) { this.message = message; } }",
					loader: "js",
				}));
			},
		}],
	});
	({ ensureString2list, getTimeRemaining, hmString2time, renderPatternTemplate } = await import(pathToFileURL(outfile).href));
});

after(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

test("renders only supported date and time templates", () => {
	const now = new Date(2026, 10, 9, 15, 4);
	assert.equal(
		renderPatternTemplate("Diary/{{date}}/{{time}} {{datetime}} {{unknown}}", now),
		"Diary/2026-11-09/15:04 2026-11-09 15:04 {{unknown}}",
	);
});

test("parses strict HH:MM values and rejects invalid input", () => {
	assert.equal(hmString2time("7:05")?.getHours(), 7);
	assert.equal(hmString2time("7:05")?.getMinutes(), 5);
	assert.equal(hmString2time("24:00"), null);
	assert.equal(hmString2time("07:60"), null);
	assert.equal(hmString2time("prefix 07:00"), null);
});

test("moves an elapsed daily timer to the next day", t => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 9, 8, 0) });
	const remaining = getTimeRemaining({ type: "every day", when: [{ HM: "07:00" }] });
	assert.equal(remaining, 23 * 60 * 60 * 1000);
});

test("moves an elapsed weekly timer to next week", t => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 9, 8, 0) });
	const remaining = getTimeRemaining({ type: "every week", when: [{ HM: "07:00", weekDay: 1 }] });
	assert.equal(remaining, (6 * 24 + 23) * 60 * 60 * 1000);
});

test("skips months without the configured month day", t => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 9, 8, 0) });
	const remaining = getTimeRemaining({ type: "every month", when: [{ HM: "07:00", monthDay: 31 }] });
	assert.equal(remaining, (51 * 24 + 23) * 60 * 60 * 1000);
});

test("normalizes comma-separated tag settings", () => {
	assert.deepEqual(ensureString2list("one, two,,three\n"), ["one", "two", "three"]);
	assert.deepEqual(ensureString2list(["one", "two"]), ["one", "two"]);
	assert.deepEqual(ensureString2list(undefined), []);
});
