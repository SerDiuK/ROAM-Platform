import { Command } from "@oclif/core";
import type { ApiClient } from "@roam/api";
import { config } from "./config.js";
import { api } from "./lib/api.js";
import { connect, disconnect } from "./lib/db.js";

export abstract class BaseCommand extends Command {
	protected api: ApiClient = api();
	protected backend = config.ROAM_BACKEND_URL;
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
