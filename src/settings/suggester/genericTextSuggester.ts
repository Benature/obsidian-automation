import { AbstractInputSuggest, type App } from "obsidian";


export class CommandSuggester extends AbstractInputSuggest<string>{
	textInputEl: HTMLInputElement;
	constructor(
		public app: App,
		public inputEl: HTMLInputElement,
		private items: string[],
	) {
		super(app, inputEl);
		this.textInputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		const inputLowerCase: string = inputStr.toLowerCase();

		const filtered = this.items.filter(item => item.toLowerCase().includes(inputLowerCase));

		if (!filtered) this.close();

		return filtered;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		if (value) el.setText(value);
	}

	selectSuggestion(item: string): void {
		this.setValue(item);
		this.close();
	}
}
