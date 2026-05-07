"use client";

import { cn } from "@roam/ui";
import { cva, type VariantProps } from "class-variance-authority";
import {
	type ComponentProps,
	type CSSProperties,
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { Icon } from "./icon";

type SidebarContextValue = {
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	toggleSidebar: () => void;
	side: "left" | "right";
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}
	return context;
}

type SidebarProviderProps = {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	side?: "left" | "right";
	children: React.ReactNode;
};

export function SidebarProvider({
	defaultOpen = true,
	open: openProp,
	onOpenChange,
	side = "left",
	children,
}: SidebarProviderProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const open = openProp ?? internalOpen;

	const setOpen = useCallback(
		(value: boolean) => {
			if (onOpenChange) onOpenChange(value);
			else setInternalOpen(value);
		},
		[onOpenChange],
	);

	const toggleSidebar = useCallback(() => {
		setOpen(!open);
	}, [open, setOpen]);

	const value = useMemo<SidebarContextValue>(
		() => ({
			state: open ? "expanded" : "collapsed",
			open,
			setOpen,
			toggleSidebar,
			side,
		}),
		[open, setOpen, toggleSidebar, side],
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

export function SidebarTrigger({
	className,
	onClick,
	children,
	...props
}: ComponentProps<"button">) {
	const { toggleSidebar } = useSidebar();

	return (
		<button
			type="button"
			data-sidebar="trigger"
			data-slot="sidebar-trigger"
			aria-label="Toggle Sidebar"
			className={cn(
				"inline-flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
				className,
			)}
			onClick={(event) => {
				onClick?.(event);
				toggleSidebar();
			}}
			{...props}
		>
			{children ?? <Icon name="left_panel_open" />}
			<span className="sr-only">Toggle Sidebar</span>
		</button>
	);
}

export function SidebarRail({ className, ...props }: ComponentProps<"button">) {
	const { toggleSidebar } = useSidebar();

	return (
		<button
			type="button"
			data-sidebar="rail"
			data-slot="sidebar-rail"
			aria-label="Toggle Sidebar"
			tabIndex={-1}
			onClick={toggleSidebar}
			title="Toggle Sidebar"
			className={cn(
				"absolute inset-y-0 z-30 hidden w-3 transition-all ease-linear sm:flex",
				"group-data-[side=left]:-right-3",
				"group-data-[side=right]:-left-3",
				"after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-sidebar-border hover:after:bg-sidebar-ring",
				"group-data-[collapsible=offcanvas]:translate-x-0",
				className,
			)}
			{...props}
		/>
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

const sidebarMenuButtonVariants = cva(
	"peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			size: {
				sm: "h-7 text-xs",
				default: "h-9 text-sm",
				lg: "h-11 text-sm",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

type SidebarMenuButtonProps = ComponentProps<"button"> & {
	isActive?: boolean;
} & VariantProps<typeof sidebarMenuButtonVariants>;

export function SidebarMenuButton({
	isActive = false,
	size = "default",
	className,
	...props
}: SidebarMenuButtonProps) {
	return (
		<button
			data-slot="sidebar-menu-button"
			data-sidebar="menu-button"
			data-active={isActive}
			className={cn(sidebarMenuButtonVariants({ size }), className)}
			{...props}
		/>
	);
}

export type { SidebarContextValue };
export const SIDEBAR_CSS_VARS: CSSProperties = {
	"--sidebar-width": "17rem",
	"--sidebar-width-icon": "3rem",
} as CSSProperties;
