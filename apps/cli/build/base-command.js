import { Command } from "@oclif/core";
import { api, backendUrl } from "./lib/api.js";
import { connect, disconnect } from "./lib/db.js";
// Base for commands that hit the backend HTTP API. No DB connection unless
// the command opts in via `requireDb()`.
export class BaseCommand extends Command {
    api = api();
    backend = backendUrl();
    dbOpened = false;
    async requireDb() {
        if (!this.dbOpened) {
            await connect();
            this.dbOpened = true;
        }
    }
    async finally() {
        if (this.dbOpened) {
            await disconnect();
        }
    }
}
//# sourceMappingURL=base-command.js.map