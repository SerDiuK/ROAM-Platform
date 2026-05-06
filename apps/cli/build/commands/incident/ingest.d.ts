import { BaseCommand } from "../../base-command.js";
export default class IncidentIngest extends BaseCommand {
    static summary: string;
    static description: string;
    static examples: string[];
    static args: {
        audio: import("@oclif/core/interfaces").Arg<string | undefined, Record<string, unknown>>;
    };
    static flags: {
        transcript: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
        "mime-type": import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
        "no-wait": import("@oclif/core/interfaces").BooleanFlag<boolean>;
        timeout: import("@oclif/core/interfaces").OptionFlag<number, import("@oclif/core/interfaces").CustomOptions>;
    };
    run(): Promise<void>;
    private buildPayload;
    private waitForBriefing;
}
//# sourceMappingURL=ingest.d.ts.map