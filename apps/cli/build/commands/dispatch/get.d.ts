import { BaseCommand } from "../../base-command.js";
export default class DispatchGet extends BaseCommand {
    static summary: string;
    static description: string;
    static examples: string[];
    static args: {
        id: import("@oclif/core/interfaces").Arg<string, Record<string, unknown>>;
    };
    run(): Promise<void>;
}
//# sourceMappingURL=get.d.ts.map