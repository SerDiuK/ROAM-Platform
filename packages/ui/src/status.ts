import type { VehicleStatus } from "@roam/shared";

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
	available: "#10b981",
	in_use: "#f59e0b",
	locked: "#ef4444",
	offline: "#6b7280",
};
