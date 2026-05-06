import { select } from "@inquirer/prompts";
import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatStatus, shortId } from "../../lib/format.js";
import { resolveDispatchId, resolveResponderId } from "../../lib/resolve.js";
export default class DispatchClear extends BaseCommand {
    static summary = "Mark a claimed dispatch as cleared (scene done).";
    static description = "Flips a claimed dispatch into the cleared (resolved) state and marks the linked incident as resolved + clearedAt.";
    static examples = [
        "<%= config.bin %> dispatch clear 429a4acd",
        "<%= config.bin %> dispatch clear 429a4acd --by THOMAS-1",
    ];
    static args = {
        id: Args.string({ description: "Dispatch id or prefix", required: true }),
    };
    static flags = {
        by: Flags.string({
            description: "Responder id, prefix, or name marking the scene cleared. Interactive picker if omitted.",
        }),
    };
    async run() {
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
            spinner.succeed(`Dispatch ${shortId(dispatch._id)} → ${formatStatus(dispatch.status)} · incident resolved`);
        }
        catch (err) {
            const code = err.code;
            const message = err.message ?? String(err);
            spinner.fail(chalk.red(`${code ?? "ERROR"}: ${message}`));
            this.exit(1);
        }
    }
    async pickClearer(dispatchId, fromFlag) {
        if (fromFlag) {
            return resolveResponderId(this.api, fromFlag);
        }
        const { dispatch } = await this.api.dispatch.get({ id: dispatchId });
        if (dispatch.claimedByResponderIds.length === 0) {
            // No claimers — likely the clear will fail, but let it through with
            // no clearedBy so the backend's CONFLICT message is what surfaces.
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
//# sourceMappingURL=clear.js.map