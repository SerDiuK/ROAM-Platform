// TS mirror of tokens.css for JS consumers (Leaflet markers, react-navigation themes).
// Values must match tokens.css verbatim — change both together.

const TOKENS = {
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

export type Token = keyof typeof TOKENS;

export function color(token: Token): string {
	return TOKENS[token];
}
