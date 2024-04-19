
import { fromStringCode } from "src/util";
import { ActionSettings, FilterKind } from "../types";

export function genFilterDesc(Action: ActionSettings): string {
	const filter = Action.filters[0];
	switch (filter.kind) {
		case FilterKind.none:
			return ``;
		case FilterKind.filePath:
			console.log(filter)
			if (filter.modeCode) {
				return `File path (now): ` + fromStringCode(filter.pattern) as string;
			} else {
				return `File path: ` + filter.pattern;
			}
			break;
		case FilterKind.tags:
			return `Tags (separated by comma)`;// + filter.pattern;
			return `Tags (separated by comma): ` + filter.pattern;
			return filter.pattern;

	}
}
