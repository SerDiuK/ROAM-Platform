/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
	presets: [require("nativewind/preset")],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter_400Regular"],
				"sans-medium": ["Inter_500Medium"],
				"sans-semibold": ["Inter_600SemiBold"],
				"sans-bold": ["Inter_700Bold"],
			},
			colors: {
				border: "var(--border)",
				input: "var(--input)",
				ring: "var(--ring)",
				background: "var(--background)",
				foreground: "var(--foreground)",
				primary: {
					DEFAULT: "var(--primary)",
					foreground: "var(--primary-foreground)",
				},
				secondary: {
					DEFAULT: "var(--secondary)",
					foreground: "var(--secondary-foreground)",
				},
				destructive: {
					DEFAULT: "var(--destructive)",
					foreground: "var(--destructive-foreground)",
				},
				muted: {
					DEFAULT: "var(--muted)",
					foreground: "var(--muted-foreground)",
				},
				accent: {
					DEFAULT: "var(--accent)",
					foreground: "var(--accent-foreground)",
				},
				warning: "var(--warning)",
				danger: "var(--danger)",
				offline: "var(--offline)",
				sidebar: {
					DEFAULT: "var(--sidebar)",
					foreground: "var(--sidebar-foreground)",
					border: "var(--sidebar-border)",
					accent: "var(--sidebar-accent)",
					"accent-foreground": "var(--sidebar-accent-foreground)",
					ring: "var(--sidebar-ring)",
				},
				lime: {
					DEFAULT: "var(--lime)",
					foreground: "var(--lime-foreground)",
				},
				border2: "var(--border2)",
				solana: "var(--solana)",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
};
