import { select } from "@inquirer/prompts";
import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatStatus, shortId } from "../../lib/format.js";
import { resolveDispatchId, resolveResponderId } from "../../lib/resolve.js";

export default class DispatchClear extends BaseCommand {
	static override summary = "Mark a claimed dispatch as cleared (scene done).";
	static override description =
		"Flips a claimed dispatch into the cleared (resolved) state and marks the linked incident as resolved + clearedAt.";

	static override examples = [
		"<%= config.bin %> dispatch clear 429a4acd",
		"<%= config.bin %> dispatch clear 429a4acd --by THOMAS-1",
	];

	static override args = {
		id: Args.string({ description: "Dispatch id or prefix", required: true }),
	};

	static override flags = {
		by: Flags.string({
			description:
				"Responder id, prefix, or name marking the scene cleared. Interactive picker if omitted.",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(DispatchClear);
		const spinner = ora();

		const dispatchId = await resolveDispatchId(this.api, args.id);
		if (!dispatchId) {
			this.error(chalk.red(`No dispatch matched "${args.id}"`));
		}

		const clearedBy = await this.pickClearer(dispatchId, flags.by);

		spinner.start("Clearing");
		try {
			const dispatch = await this.api.dispatch.clear({
				dispatchId,
				clearedBy: clearedBy ?? undefined,
			});
			spinner.succeed(
				`Dispatch ${shortId(dispatch._id)} → ${formatStatus(dispatch.status)} · incident resolved`,
			);
		} catch (err) {
			const code = (err as { code?: string }).code;
			const message = (err as { message?: string }).message ?? String(err);
			spinner.fail(chalk.red(`${code ?? "ERROR"}: ${message}`));
			this.exit(1);
		}
	}

	private async pickClearer(
		dispatchId: string,
		fromFlag?: string,
	): Promise<string | null> {
		if (fromFlag) {
			return resolveResponderId(this.api, fromFlag);
		}
		const { dispatch } = await this.api.dispatch.get({ id: dispatchId });
		if (dispatch.claimedByResponderIds.length === 0) {
			return null;
		}
		const allResponders = await this.api.responders.list();
		const names = new Map(allResponders.map((r) => [r._id, r.name]));
		const choices = dispatch.claimedByResponderIds.map((id) => ({
			name: `${names.get(id) ?? "?"} (${shortId(id)})`,
			value: id,
		}));
		return select({
			message: "Which responder cleared the scene?",
			choices,
		});
	}
}
