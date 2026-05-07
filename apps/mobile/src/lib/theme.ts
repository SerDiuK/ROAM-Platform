import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { color } from "@roam/ui";

export const NAV_THEME: { light: Theme; dark: Theme } = {
	light: {
		...DefaultTheme,
		colors: {
			...DefaultTheme.colors,
			background: color("background", "light"),
			card: color("card", "light"),
			text: color("foreground", "light"),
			border: color("border", "light"),
			primary: color("primary", "light"),
			notification: color("destructive", "light"),
		},
	},
	dark: {
		...DarkTheme,
		colors: {
			...DarkTheme.colors,
			background: color("background", "dark"),
			card: color("card", "dark"),
			text: color("foreground", "dark"),
			border: color("border", "dark"),
			primary: color("primary", "dark"),
			notification: color("destructive", "dark"),
		},
	},
};
