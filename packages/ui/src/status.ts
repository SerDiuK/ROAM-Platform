import type { VehicleStatus } from "@roam/shared";
import { color } from "./tokens";

export type StatusTone = "primary" | "warning" | "danger" | "offline";

export const STATUS_TONE: Record<VehicleStatus, StatusTone> = {
	available: "primary",
	in_use: "warning",
	locked: "danger",
	offline: "offline",
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
	available: "Available",
	in_use: "Active",
	locked: "Locked",
	offline: "Offline",
};

export const STATUS_HEX: Record<VehicleStatus, string> = {
	available: color("primary"),
	in_use: color("warning"),
	locked: color("danger"),
	offline: color("offline"),
};
