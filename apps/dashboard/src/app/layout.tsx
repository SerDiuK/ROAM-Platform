import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

export const metadata: Metadata = {
	title: "ROAM Dispatch",
	description: "AI-powered emergency dispatch and fleet accountability",
};

type RootLayoutProps = {
	children: ReactNode;
};

function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en" className={inter.variable}>
			<body>{children}</body>
		</html>
	);
}

export { RootLayout as default };
