import { DarkTheme, type Theme } from "@react-navigation/native";
import { color } from "@roam/ui";

export const NAV_THEME: Theme = {
	...DarkTheme,
	colors: {
		...DarkTheme.colors,
		background: color("background"),
		card: color("card"),
		text: color("foreground"),
		border: color("border"),
		primary: color("primary"),
		notification: color("destructive"),
	},
};
