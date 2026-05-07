import type { ResponderAvailability } from "@roam/shared";
import type { StatusTone } from "./status";

export const AVAILABILITY_TONE: Record<ResponderAvailability, StatusTone> = {
	available: "primary",
	occupied: "warning",
	off_duty: "offline",
	unavailable: "danger",
};

export const AVAILABILITY_LABEL: Record<ResponderAvailability, string> = {
	available: "Available",
	occupied: "Occupied",
	off_duty: "Off duty",
	unavailable: "Unavailable",
};
