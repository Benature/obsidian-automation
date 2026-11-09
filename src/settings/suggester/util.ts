import { renderPatternTemplate } from "src/util";
import { ActionSettings, FilterKind } from "../types";

export function genFilterDesc(action: ActionSettings): string {
	const filter = action.filters[0];
	switch (filter.kind) {
		case FilterKind.none:
			return "";
		case FilterKind.filePath:
			return filter.modeCode
				? `File path template (now): ${renderPatternTemplate(filter.pattern)}`
				: `File path: ${filter.pattern}`;
		case FilterKind.tags:
			return `Tags (separated by comma): ${filter.pattern}`;
		default:
			return "";
	}
}
