import { Command } from "@oclif/core";
import { type ApiClient } from "@roam/api";
import { api, backendUrl } from "./lib/api.js";
import { connect, disconnect } from "./lib/db.js";

// Base for commands that hit the backend HTTP API. No DB connection unless
// the command opts in via `requireDb()`.
export abstract class BaseCommand extends Command {
	protected api: ApiClient = api();
	protected backend = backendUrl();
	private dbOpened = false;

	protected async requireDb(): Promise<void> {
		if (!this.dbOpened) {
			await connect();
			this.dbOpened = true;
		}
	}

	async finally(): Promise<void> {
		if (this.dbOpened) {
			await disconnect();
		}
	}
}
