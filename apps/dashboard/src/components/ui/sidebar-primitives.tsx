"use client";

import { cn } from "@roam/ui";
import {
	type ComponentProps,
	type CSSProperties,
	createContext,
	useContext,
	useMemo,
} from "react";

type SidebarContextValue = {
	state: "expanded" | "collapsed";
	side: "left" | "right";
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar(): SidebarContextValue {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}
	return context;
}

type SidebarProviderProps = {
	open: boolean;
	side?: "left" | "right";
	children: React.ReactNode;
};

export function SidebarProvider({
	open,
	side = "left",
	children,
}: SidebarProviderProps) {
	const value = useMemo<SidebarContextValue>(
		() => ({
			state: open ? "expanded" : "collapsed",
			side,
		}),
		[open, side],
	);

	return (
		<SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
	);
}

type SidebarProps = ComponentProps<"div"> & {
	side?: "left" | "right";
	collapsible?: "offcanvas" | "none";
};

export function Sidebar({
	side: sideProp,
	collapsible = "offcanvas",
	className,
	children,
	...props
}: SidebarProps) {
	const { state, side: ctxSide } = useSidebar();
	const side = sideProp ?? ctxSide;

	if (collapsible === "none") {
		return (
			<div
				data-slot="sidebar"
				className={cn(
					"flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		);
	}

	return (
		<div
			data-slot="sidebar-container"
			data-state={state}
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-side={side}
			className={cn(
				"absolute inset-y-0 z-20 flex w-(--sidebar-width) transition-transform duration-200 ease-linear",
				side === "left"
					? "left-0 border-r border-sidebar-border data-[collapsible=offcanvas]:-translate-x-full"
					: "right-0 border-l border-sidebar-border data-[collapsible=offcanvas]:translate-x-full",
				className,
			)}
			{...props}
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground shadow-2xl shadow-black/40"
			>
				{children}
			</div>
		</div>
	);
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-header"
			data-sidebar="header"
			className={cn(
				"flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-footer"
			data-sidebar="footer"
			className={cn(
				"flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-content"
			data-sidebar="content"
			className={cn(
				"flex min-h-0 flex-1 flex-col gap-1 overflow-auto py-2",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-group"
			data-sidebar="group"
			className={cn(
				"relative flex w-full min-w-0 flex-col px-2 py-1",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarGroupLabel({
	className,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-group-label"
			data-sidebar="group-label"
			className={cn(
				"flex h-7 shrink-0 items-center px-2 text-xs font-medium tracking-wider text-sidebar-foreground/50 uppercase",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarGroupContent({
	className,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-group-content"
			data-sidebar="group-content"
			className={cn("w-full text-sm", className)}
			{...props}
		/>
	);
}

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
	return (
		<ul
			data-slot="sidebar-menu"
			data-sidebar="menu"
			className={cn("flex w-full min-w-0 flex-col gap-1", className)}
			{...props}
		/>
	);
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
	return (
		<li
			data-slot="sidebar-menu-item"
			data-sidebar="menu-item"
			className={cn("group/menu-item relative", className)}
			{...props}
		/>
	);
}

export const SIDEBAR_CSS_VARS: CSSProperties & Record<`--${string}`, string> = {
	"--sidebar-width": "17rem",
};
