import { Command } from "./Command";
import { v4 as uuidv4 } from "uuid";

export class ObsidianCommand extends Command  {
	name: string;
	id: string;
	commandId: string;
	// type: CommandType;

	constructor(name: string, commandId: string) {
		super(name);
		this.commandId = commandId;
	}

	generateId = () => (this.id = uuidv4());
}
