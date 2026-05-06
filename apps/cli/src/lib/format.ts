import type { Dispatch, DispatchResponse, Responder } from "@roam/shared";
import chalk from "chalk";

export function shortId(id: string): string {
	return id.slice(0, 8);
}

export function formatStatus(status: Dispatch["status"]): string {
	switch (status) {
		case "pending":
			return chalk.yellow("pending");
		case "claimed":
			return chalk.green("claimed");
		case "cleared":
			return chalk.blue("cleared");
		case "expired":
			return chalk.gray("expired");
		case "cancelled":
			return chalk.red("cancelled");
		default:
			return status;
	}
}

export function formatDecision(decision: DispatchResponse["decision"]): string {
	return decision === "accept"
		? chalk.green("accept")
		: chalk.red("decline");
}

export function formatRole(role: Responder["role"]): string {
	return role === "dispatcher"
		? chalk.cyan("dispatcher")
		: chalk.white("responder");
}

export function formatRelative(date: Date | string): string {
	const ts = new Date(date).getTime();
	const deltaMs = ts - Date.now();
	const sign = deltaMs >= 0 ? "+" : "-";
	const abs = Math.abs(deltaMs);
	if (abs < 60_000) return `${sign}${Math.round(abs / 1000)}s`;
	if (abs < 3_600_000) return `${sign}${Math.round(abs / 60_000)}m`;
	return `${sign}${(abs / 3_600_000).toFixed(1)}h`;
}
