// TS mirror of tokens.css for JS consumers (Leaflet markers, react-navigation themes).
// Values must match tokens.css verbatim — change both together.

const LIGHT = {
	background: "#ffffff",
	foreground: "#0a0c10",
	card: "#ffffff",
	cardForeground: "#0a0c10",
	popover: "#ffffff",
	popoverForeground: "#0a0c10",
	primary: "#38bdf8",
	primaryForeground: "#05140d",
	secondary: "#e5e7eb",
	secondaryForeground: "#0a0c10",
	muted: "#e5e7eb",
	mutedForeground: "#6b7280",
	accent: "#e5e7eb",
	accentForeground: "#0a0c10",
	destructive: "#ef4343",
	destructiveForeground: "#fafafa",
	border: "#dcdfe4",
	input: "#dcdfe4",
	ring: "#38bdf8",
	warning: "#f59f0a",
	warningForeground: "#140f05",
	danger: "#ef4343",
	dangerForeground: "#180606",
	offline: "#6b7280",
	sidebar: "#ffffff",
	sidebarForeground: "#0a0c10",
	sidebarBorder: "#dcdfe4",
	sidebarAccent: "#e5e7eb",
	sidebarAccentForeground: "#0a0c10",
	sidebarRing: "#38bdf8",
} as const;

const DARK = {
	background: "#0a0c10",
	foreground: "#e5e7eb",
	card: "#0e1116",
	cardForeground: "#e5e7eb",
	popover: "#0e1116",
	popoverForeground: "#e5e7eb",
	primary: "#38bdf8",
	primaryForeground: "#05140d",
	secondary: "#212731",
	secondaryForeground: "#e5e7eb",
	muted: "#212731",
	mutedForeground: "#9ea3ae",
	accent: "#1d283a",
	accentForeground: "#f1f5f9",
	destructive: "#ef4343",
	destructiveForeground: "#fafafa",
	border: "#212731",
	input: "#212731",
	ring: "#38bdf8",
	warning: "#f59f0a",
	warningForeground: "#140f05",
	danger: "#ef4343",
	dangerForeground: "#180606",
	offline: "#6b7280",
	sidebar: "#0f1115",
	sidebarForeground: "#e5e7eb",
	sidebarBorder: "#212731",
	sidebarAccent: "#1d283a",
	sidebarAccentForeground: "#f1f5f9",
	sidebarRing: "#38bdf8",
} as const;

export const TOKENS = { light: LIGHT, dark: DARK } as const;

export type ThemeMode = keyof typeof TOKENS;
export type Token = keyof typeof DARK;

export function color(token: Token, mode: ThemeMode = "dark"): string {
	return TOKENS[mode][token];
}
