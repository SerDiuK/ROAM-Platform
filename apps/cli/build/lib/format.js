import chalk from "chalk";
export function shortId(id) {
    return id.slice(0, 8);
}
export function formatStatus(status) {
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
export function formatDecision(decision) {
    return decision === "accept"
        ? chalk.green("accept")
        : chalk.red("decline");
}
export function formatRole(role) {
    return role === "dispatcher"
        ? chalk.cyan("dispatcher")
        : chalk.white("responder");
}
export function formatRelative(date) {
    const ts = new Date(date).getTime();
    const deltaMs = ts - Date.now();
    const sign = deltaMs >= 0 ? "+" : "-";
    const abs = Math.abs(deltaMs);
    if (abs < 60_000)
        return `${sign}${Math.round(abs / 1000)}s`;
    if (abs < 3_600_000)
        return `${sign}${Math.round(abs / 60_000)}m`;
    return `${sign}${(abs / 3_600_000).toFixed(1)}h`;
}
//# sourceMappingURL=format.js.map