"use client";

import { Icon } from "./icon";

const SOLANA_CLUSTER = "devnet";

type ExplorerLinkProps = {
	signature?: string | null;
	label?: string;
};

export function ExplorerLink({ signature, label = "TX" }: ExplorerLinkProps) {
	if (!signature) {
		return (
			<span className="inline-flex h-4 items-center gap-1 rounded border border-sidebar-border bg-sidebar/40 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
				⬡ {label}
			</span>
		);
	}
	return (
		<a
			href={`https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex h-4 items-center gap-1 rounded border border-solana/30 bg-solana/10 px-2 text-2xs font-semibold uppercase tracking-wider text-solana transition-colors hover:bg-solana/20"
		>
			⬡ {label}
			<Icon name="open_in_new" className="text-2xs" />
		</a>
	);
}
