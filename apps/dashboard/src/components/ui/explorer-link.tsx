"use client";

import { solanaExplorerTxUrl } from "@roam/ui";
import { Icon } from "./icon";

type ExplorerLinkProps = {
	signature?: string;
};

export function ExplorerLink({ signature }: ExplorerLinkProps) {
	if (!signature) {
		return (
			<span className="inline-flex h-4 items-center gap-1 rounded border border-sidebar-border bg-sidebar/40 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
				⬡ TX
			</span>
		);
	}
	return (
		<a
			href={solanaExplorerTxUrl(signature)}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex h-4 items-center gap-1 rounded border border-solana/30 bg-solana/10 px-2 text-2xs font-semibold uppercase tracking-wider text-solana transition-colors hover:bg-solana/20"
		>
			⬡ TX
			<Icon name="open_in_new" className="text-2xs" />
		</a>
	);
}
