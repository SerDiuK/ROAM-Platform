import { input, select } from "@inquirer/prompts";
import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { shortId } from "../../lib/format.js";
import { resolveDispatchId, resolveResponderId } from "../../lib/resolve.js";
const REASON_PRESETS = ["off-shift", "too far", "no capability", "other"];
export default class DispatchDecline extends BaseCommand {
    static summary = "Decline a dispatch as a responder.";
    static description = "Record a decline. Dispatch state is unchanged — declines are audit-trail only.";
    static examples = [
        "<%= config.bin %> dispatch decline 429a4acd",
        "<%= config.bin %> dispatch decline 429a4acd --responder RSP-1 --reason 'too far'",
    ];
    static args = {
        id: Args.string({ description: "Dispatch id or prefix", required: true }),
    };
    static flags = {
        responder: Flags.string({
            char: "r",
            description: "Responder id, prefix, or name. Interactive picker if omitted.",
        }),
        reason: Flags.string({
            description: "Decline reason. Interactive picker if omitted.",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(DispatchDecline);
        const spinner = ora();
        const dispatchId = await resolveDispatchId(this.api, args.id);
        if (!dispatchId) {
            this.error(chalk.red(`No dispatch matched "${args.id}"`));
        }
        const responderId = await this.pickResponder(dispatchId, flags.responder);
        if (!responderId) {
            this.error(chalk.red("No responder selected."));
        }
        const reason = await this.pickReason(flags.reason);
        spinner.start("Declining");
        try {
            await this.api.dispatch.respond({
                dispatchId,
                responderId,
                decision: "decline",
                declineReason: reason,
            });
            spinner.succeed(`${shortId(responderId)} declined${reason ? ` · ${chalk.dim(reason)}` : ""}`);
        }
        catch (err) {
            const code = err.code;
            const message = err.message ?? String(err);
            spinner.fail(chalk.red(`${code ?? "ERROR"}: ${message}`));
            this.exit(1);
        }
    }
    async pickResponder(dispatchId, fromFlag) {
        if (fromFlag) {
            return resolveResponderId(this.api, fromFlag);
        }
        const { dispatch } = await this.api.dispatch.get({ id: dispatchId });
        const allResponders = await this.api.responders.list();
        const assignedNames = new Map(allResponders.map((r) => [r._id, r.name]));
        const choices = dispatch.assignedResponderIds.map((id) => ({
            name: `${assignedNames.get(id) ?? "?"} (${shortId(id)})`,
            value: id,
        }));
        if (choices.length === 0) {
            this.error(chalk.red("Dispatch has no assigned responders."));
        }
        return select({
            message: "Pick the responder declining this dispatch:",
            choices,
        });
    }
    async pickReason(fromFlag) {
        if (fromFlag)
            return fromFlag;
        const choice = await select({
            message: "Decline reason:",
            choices: REASON_PRESETS.map((r) => ({ name: r, value: r })),
        });
        if (choice === "other") {
            return input({ message: "Reason:" });
        }
        return choice;
    }
}
//# sourceMappingURL=decline.js.map