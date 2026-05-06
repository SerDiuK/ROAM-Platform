import { Command } from "@oclif/core";
import { type ApiClient } from "@roam/api";
export declare abstract class BaseCommand extends Command {
    protected api: ApiClient;
    protected backend: string;
    private dbOpened;
    protected requireDb(): Promise<void>;
    finally(): Promise<void>;
}
//# sourceMappingURL=base-command.d.ts.map