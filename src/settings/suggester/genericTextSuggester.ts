import { AbstractInputSuggest, type App } from "obsidian";


export class CommandSuggester extends AbstractInputSuggest<string>{
	textInputEl: HTMLInputElement;
	constructor(
		public app: App,
		public inputEl: HTMLInputElement,
		private items: string[],
	) {
		super(app, inputEl);
	}

	getSuggestions(inputStr: string): string[] {
		const inputLowerCase: string = inputStr.toLowerCase();

		const filtered = this.items.filter((item) => {
			if (item.toLowerCase().contains(inputLowerCase)) return item;
		});

		if (!filtered) this.close();

		return filtered;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		if (value) el.setText(value);
	}

	selectSuggestion(item: string): void {
		this.textInputEl.value = item;
		this.textInputEl.trigger("input");
		this.close();
	}
}
