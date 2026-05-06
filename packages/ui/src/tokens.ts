// TS mirror of tokens.css for JS consumers (Leaflet markers, react-navigation themes).
// Values must match tokens.css verbatim — change both together.

const LIGHT = {
	background: "0 0% 100%",
	foreground: "220 22% 5%",
	card: "0 0% 100%",
	cardForeground: "220 22% 5%",
	popover: "0 0% 100%",
	popoverForeground: "220 22% 5%",
	primary: "160 84% 39%",
	primaryForeground: "150 60% 5%",
	secondary: "220 13% 91%",
	secondaryForeground: "220 22% 5%",
	muted: "220 13% 91%",
	mutedForeground: "220 9% 46%",
	accent: "220 13% 91%",
	accentForeground: "220 22% 5%",
	destructive: "0 84% 60%",
	destructiveForeground: "0 0% 98%",
	border: "220 13% 88%",
	input: "220 13% 88%",
	ring: "160 84% 39%",
	warning: "38 92% 50%",
	warningForeground: "40 60% 5%",
	danger: "0 84% 60%",
	dangerForeground: "0 60% 6%",
	offline: "220 9% 46%",
	sidebar: "0 0% 100%",
	sidebarForeground: "220 22% 5%",
	sidebarBorder: "220 13% 88%",
	sidebarAccent: "220 13% 91%",
	sidebarAccentForeground: "220 22% 5%",
	sidebarRing: "160 84% 39%",
} as const;

const DARK = {
	background: "220 22% 5%",
	foreground: "220 13% 91%",
	card: "220 22% 7%",
	cardForeground: "220 13% 91%",
	popover: "220 22% 7%",
	popoverForeground: "220 13% 91%",
	primary: "160 84% 39%",
	primaryForeground: "150 60% 5%",
	secondary: "217 19% 16%",
	secondaryForeground: "220 13% 91%",
	muted: "217 19% 16%",
	mutedForeground: "220 9% 65%",
	accent: "217 33% 17%",
	accentForeground: "210 40% 96%",
	destructive: "0 84% 60%",
	destructiveForeground: "0 0% 98%",
	border: "217 19% 16%",
	input: "217 19% 16%",
	ring: "160 84% 39%",
	warning: "38 92% 50%",
	warningForeground: "40 60% 5%",
	danger: "0 84% 60%",
	dangerForeground: "0 60% 6%",
	offline: "220 9% 46%",
	sidebar: "218 17% 7%",
	sidebarForeground: "220 13% 91%",
	sidebarBorder: "217 19% 16%",
	sidebarAccent: "217 33% 17%",
	sidebarAccentForeground: "210 40% 96%",
	sidebarRing: "160 84% 39%",
} as const;

export const TOKENS = { light: LIGHT, dark: DARK } as const;

export type ThemeMode = keyof typeof TOKENS;
export type Token = keyof typeof DARK;

export function hsl(token: Token, mode: ThemeMode = "dark"): string {
	return `hsl(${TOKENS[mode][token]})`;
}
