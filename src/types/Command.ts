import { v4 as uuidv4 } from "uuid";

export abstract class Command  {
	name: string;
	// type: CommandType;
	id: string;

	protected constructor(name: string) {
		this.name = name;
		// this.type = type;
		this.id = uuidv4();
	}
}
