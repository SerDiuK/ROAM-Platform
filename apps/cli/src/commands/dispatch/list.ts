import { printTable } from "@oclif/table";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatRelative, formatStatus, shortId } from "../../lib/format.js";

export default class DispatchList extends BaseCommand {
	static override summary = "List active dispatches.";
	static override description =
		"List dispatches in active states (pending or claimed). Cleared, expired, and cancelled dispatches are excluded.";

	static override examples = ["<%= config.bin %> dispatch list"];

	async run(): Promise<void> {
		await this.parse(DispatchList);
		const spinner = ora("Loading dispatches").start();
		const dispatches = await this.api.dispatch.list();
		spinner.stop();

		if (dispatches.length === 0) {
			this.log(chalk.yellow("No active dispatches."));
			return;
		}

		this.log(chalk.bold(`\n${dispatches.length} active dispatches:\n`));

		printTable({
			data: dispatches.map((d) => ({
				id: shortId(d._id),
				status: formatStatus(d.status),
				mode: d.decisionMaker,
				required: `${d.claimedByResponderIds.length}/${d.requiredAccepts}`,
				responders: d.assignedResponderIds.length,
				usdc: d.payoutUsdc,
				expiresIn: formatRelative(d.expiresAt),
			})),
			columns: [
				"id",
				"status",
				"mode",
				"required",
				"responders",
				"usdc",
				"expiresIn",
			],
		});
	}
}
