import { printTable } from "@oclif/table";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { formatRole, shortId } from "../../lib/format.js";

export default class ResponderList extends BaseCommand {
	static override summary = "List responders.";
	static override description =
		"List all responders (medics + dispatchers) with their availability and wallet address.";

	async run(): Promise<void> {
		await this.parse(ResponderList);
		const spinner = ora("Loading responders").start();
		const responders = await this.api.responders.list();
		spinner.stop();

		this.log(chalk.bold(`\n${responders.length} responders:\n`));

		printTable({
			data: responders.map((r) => ({
				id: shortId(r._id),
				name: r.name,
				role: formatRole(r.role),
				availability: r.availability,
				wallet: r.walletAddress ? shortId(r.walletAddress) : chalk.dim("—"),
			})),
			columns: ["id", "name", "role", "availability", "wallet"],
		});
	}
}
