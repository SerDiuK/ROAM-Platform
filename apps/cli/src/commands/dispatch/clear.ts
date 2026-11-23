import { Args } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatStatus, shortId } from "../../lib/format.js";
import { resolveDispatchId } from "../../lib/resolve.js";

export default class DispatchClear extends BaseCommand {
	static override summary = "Mark a claimed dispatch as cleared (scene done).";
	static override description =
		"Flips a claimed dispatch into the cleared (resolved) state and marks the linked incident as resolved + clearedAt.";

	static override examples = ["<%= config.bin %> dispatch clear 429a4acd"];

	static override args = {
		id: Args.string({ description: "Dispatch id or prefix", required: true }),
	};

	async run(): Promise<void> {
		const { args } = await this.parse(DispatchClear);
		const spinner = ora();

		const dispatchId = await resolveDispatchId(this.api, args.id);
		if (!dispatchId) {
			this.error(chalk.red(`No dispatch matched "${args.id}"`));
		}

		spinner.start("Clearing");
		try {
			const dispatch = await this.api.dispatch.clear({ dispatchId });
			spinner.succeed(
				`Dispatch ${shortId(dispatch._id)} → ${formatStatus(dispatch.status)} · incident resolved`,
			);
		} catch (err) {
			spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
			this.exit(1);
		}
	}
}
