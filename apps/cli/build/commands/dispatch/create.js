import { Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { shortId } from "../../lib/format.js";
import { seedBriefing } from "../../lib/seed.js";
// 30-minute default. Long enough to walk a dashboard demo and pull out a
// phone, short enough that stale dispatches don't accumulate during testing.
const DEFAULT_EXPIRES_SECS = 1800;
export default class DispatchCreate extends BaseCommand {
    static summary = "Seed a briefing and confirm a dispatch (bypasses the LLM agent).";
    static description = "Seed a synthetic briefing and confirm a dispatch in one shot. Bypasses the LLM agent — useful for testing the dashboard / mobile flow without depending on the agent runner.";
    static examples = [
        "<%= config.bin %> dispatch create",
        "<%= config.bin %> dispatch create --auto",
        "<%= config.bin %> dispatch create --expires-in 600 --required 2",
        "<%= config.bin %> dispatch create --summary 'Cardiac arrest, unresponsive'",
    ];
    static flags = {
        auto: Flags.boolean({
            description: "Mark the dispatch as ai-auto (decisionMaker='ai-auto'). Default: human.",
            default: false,
        }),
        "decided-by": Flags.string({
            description: "Dispatcher responderId. Defaults to the first dispatcher in the seed.",
        }),
        "expires-in": Flags.integer({
            description: "Seconds until the dispatch expires.",
            default: DEFAULT_EXPIRES_SECS,
        }),
        required: Flags.integer({
            description: "Number of accepts required to flip the dispatch to claimed.",
            default: 1,
        }),
        summary: Flags.string({
            description: "Override the briefing summary.",
        }),
        "incident-type": Flags.string({
            description: "Override the incident classification type.",
        }),
        payout: Flags.integer({
            description: "Override the briefing payout total (USDC).",
        }),
        responders: Flags.integer({
            description: "How many responders to recommend in the briefing.",
            default: 2,
        }),
        vehicles: Flags.integer({
            description: "How many vehicles to recommend in the briefing.",
            default: 2,
        }),
    };
    async run() {
        const { flags } = await this.parse(DispatchCreate);
        const spinner = ora("Seeding briefing").start();
        try {
            await this.requireDb();
            const seeded = await seedBriefing({
                summary: flags.summary,
                incidentType: flags["incident-type"],
                totalUsdc: flags.payout,
                responderCount: flags.responders,
                vehicleCount: flags.vehicles,
            });
            spinner.succeed(`Briefing seeded · ${chalk.cyan(shortId(seeded.briefingId))} (${seeded.recommendedResponderIds.length} responders, ${seeded.recommendedVehicleIds.length} vehicles)`);
            let decidedBy = flags["decided-by"];
            if (!decidedBy && !flags.auto) {
                const responders = await this.api.responders.list();
                const dispatcher = responders.find((r) => r.role === "dispatcher");
                if (dispatcher)
                    decidedBy = dispatcher._id;
            }
            spinner.start("Confirming dispatch");
            const dispatch = await this.api.dispatch.confirm({
                briefingId: seeded.briefingId,
                decisionMaker: flags.auto ? "ai-auto" : "human",
                decidedBy: flags.auto ? undefined : decidedBy,
                requiredAccepts: flags.required,
                expiresInSecs: flags["expires-in"],
            });
            spinner.succeed(`Dispatch created · ${chalk.cyan(dispatch._id)}`);
            this.log("");
            this.log(chalk.bold("Dispatch summary"));
            this.log(`  id          ${dispatch._id}`);
            this.log(`  status      ${dispatch.status}`);
            this.log(`  mode        ${dispatch.decisionMaker}${dispatch.decidedBy ? ` (by ${shortId(dispatch.decidedBy)})` : ""}`);
            this.log(`  payoutUsdc  ${dispatch.payoutUsdc}`);
            this.log(`  required    ${dispatch.requiredAccepts} of ${dispatch.assignedResponderIds.length}`);
            this.log(`  expiresAt   ${new Date(dispatch.expiresAt).toISOString()}`);
            this.log("");
            this.log(chalk.bold("Recommended responders"));
            for (const id of dispatch.assignedResponderIds) {
                this.log(`  ${id}`);
            }
            this.log("");
            this.log(chalk.dim("Next:"));
            this.log(chalk.dim(`  roam dispatch accept ${dispatch._id} --responder <id>`));
            this.log(chalk.dim(`  roam dispatch decline ${dispatch._id} --responder <id> --reason 'too far'`));
        }
        catch (err) {
            spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
            this.exit(1);
        }
    }
}
//# sourceMappingURL=create.js.map