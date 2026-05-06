import { BaseCommand } from "../../base-command.js";
export default class DispatchClear extends BaseCommand {
    static summary: string;
    static description: string;
    static examples: string[];
    static args: {
        id: import("@oclif/core/interfaces").Arg<string, Record<string, unknown>>;
    };
    static flags: {
        by: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
    };
    run(): Promise<void>;
    private pickClearer;
}
//# sourceMappingURL=clear.d.ts.map