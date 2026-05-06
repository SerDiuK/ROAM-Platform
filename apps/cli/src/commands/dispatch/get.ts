import { Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { resolveDispatchId } from "../../lib/resolve.js";
import {
	formatDecision,
	formatRelative,
	formatStatus,
	shortId,
} from "../../lib/format.js";

export default class DispatchGet extends BaseCommand {
	static override summary = "Show a dispatch with all responses.";
	static override description =
		"Show a dispatch with all responses. Accepts a full id or a unique short prefix.";

	static override examples = [
		"<%= config.bin %> dispatch get 429a4acd",
		"<%= config.bin %> dispatch get 429a4acd-6131-487e-b89c-602559e2b903",
	];

	static override args = {
		id: Args.string({ description: "Dispatch id or prefix", required: true }),
	};

	async run(): Promise<void> {
		const { args } = await this.parse(DispatchGet);
		const spinner = ora("Loading dispatch").start();

		const id = await resolveDispatchId(this.api, args.id);
		if (!id) {
			spinner.fail(chalk.red(`No dispatch matched "${args.id}"`));
			this.exit(1);
		}

		const { dispatch, responses } = await this.api.dispatch.get({ id });
		spinner.stop();

		this.log("");
		this.log(chalk.bold(`Dispatch ${dispatch._id}`));
		this.log(`  status       ${formatStatus(dispatch.status)}`);
		this.log(`  mode         ${dispatch.decisionMaker}`);
		this.log(
			`  required     ${dispatch.claimedByResponderIds.length}/${dispatch.requiredAccepts}`,
		);
		this.log(`  payoutUsdc   ${dispatch.payoutUsdc}`);
		this.log(`  decidedAt    ${new Date(dispatch.decidedAt).toISOString()}`);
		this.log(
			`  expiresAt    ${new Date(dispatch.expiresAt).toISOString()} (${formatRelative(dispatch.expiresAt)})`,
		);
		this.log("");
		this.log(chalk.bold("Assigned responders"));
		for (const id of dispatch.assignedResponderIds) {
			const claimed = dispatch.claimedByResponderIds.includes(id);
			this.log(`  ${id} ${claimed ? chalk.green("✓ claimed") : ""}`);
		}

		this.log("");
		this.log(chalk.bold(`Responses (${responses.length})`));
		if (responses.length === 0) {
			this.log(chalk.dim("  none yet"));
			return;
		}
		printTable({
			data: responses.map((r) => ({
				responder: shortId(r.responderId),
				decision: formatDecision(r.decision),
				reason: r.declineReason ?? "",
				at: new Date(r.respondedAt).toISOString(),
			})),
			columns: ["responder", "decision", "reason", "at"],
		});
	}
}
