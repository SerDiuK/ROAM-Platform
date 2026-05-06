import { select } from "@inquirer/prompts";
import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatStatus, shortId } from "../../lib/format.js";
import { resolveDispatchId, resolveResponderId } from "../../lib/resolve.js";

export default class DispatchAccept extends BaseCommand {
	static override summary = "Accept a dispatch as a responder.";
	static override description =
		"Record an accept response. First-to-claim wins — once requiredAccepts is reached, the dispatch flips to claimed.";

	static override examples = [
		"<%= config.bin %> dispatch accept 429a4acd",
		"<%= config.bin %> dispatch accept 429a4acd --responder THOMAS-1",
		"<%= config.bin %> dispatch accept 429a4acd --responder 83d8f243",
	];

	static override args = {
		id: Args.string({ description: "Dispatch id or prefix", required: true }),
	};

	static override flags = {
		responder: Flags.string({
			char: "r",
			description:
				"Responder id, prefix, or name. Interactive picker if omitted.",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(DispatchAccept);
		const spinner = ora();

		const dispatchId = await resolveDispatchId(this.api, args.id);
		if (!dispatchId) {
			this.error(chalk.red(`No dispatch matched "${args.id}"`));
		}

		const responderId = await this.pickResponder(
			dispatchId,
			flags.responder,
		);
		if (!responderId) {
			this.error(chalk.red("No responder selected."));
		}

		spinner.start("Accepting");
		try {
			const result = await this.api.dispatch.respond({
				dispatchId,
				responderId,
				decision: "accept",
			});
			spinner.succeed(
				`${shortId(responderId)} accepted · dispatch ${formatStatus(result.dispatch.status)}`,
			);
			if (result.dispatch.status === "claimed") {
				this.log(
					chalk.green(
						`Claimed by ${result.dispatch.claimedByResponderIds.length} of ${result.dispatch.requiredAccepts}.`,
					),
				);
			} else {
				this.log(
					chalk.yellow(
						`${result.dispatch.claimedByResponderIds.length}/${result.dispatch.requiredAccepts} accepts so far — still pending.`,
					),
				);
			}
		} catch (err) {
			const code = (err as { code?: string }).code;
			const message = (err as { message?: string }).message ?? String(err);
			spinner.fail(chalk.red(`${code ?? "ERROR"}: ${message}`));
			this.exit(1);
		}
	}

	private async pickResponder(
		dispatchId: string,
		fromFlag?: string,
	): Promise<string | null> {
		if (fromFlag) {
			return resolveResponderId(this.api, fromFlag);
		}
		const { dispatch } = await this.api.dispatch.get({ id: dispatchId });
		const allResponders = await this.api.responders.list();
		const assignedNames = new Map(
			allResponders.map((r) => [r._id, r.name]),
		);
		const choices = dispatch.assignedResponderIds.map((id) => ({
			name: `${assignedNames.get(id) ?? "?"} (${shortId(id)})`,
			value: id,
		}));
		if (choices.length === 0) {
			this.error(chalk.red("Dispatch has no assigned responders."));
		}
		return select({
			message: "Pick the responder accepting this dispatch:",
			choices,
		});
	}
}
