import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { hsl } from "@roam/ui";

export const NAV_THEME: { light: Theme; dark: Theme } = {
	light: {
		...DefaultTheme,
		colors: {
			...DefaultTheme.colors,
			background: hsl("background", "light"),
			card: hsl("card", "light"),
			text: hsl("foreground", "light"),
			border: hsl("border", "light"),
			primary: hsl("primary", "light"),
			notification: hsl("destructive", "light"),
		},
	},
	dark: {
		...DarkTheme,
		colors: {
			...DarkTheme.colors,
			background: hsl("background", "dark"),
			card: hsl("card", "dark"),
			text: hsl("foreground", "dark"),
			border: hsl("border", "dark"),
			primary: hsl("primary", "dark"),
			notification: hsl("destructive", "dark"),
		},
	},
};
