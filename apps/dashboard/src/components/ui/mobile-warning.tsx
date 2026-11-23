"use client";

import { cn } from "@roam/ui";
import { type ReactNode, useSyncExternalStore } from "react";
import { Icon } from "./icon";

const MIN_WIDTH = 1024;
const MIN_ASPECT_RATIO = 1.2;

type Viewport = {
	width: number;
	height: number;
};

function subscribeToViewport(onChange: () => void): () => void {
	window.addEventListener("resize", onChange);
	window.addEventListener("orientationchange", onChange);
	return () => {
		window.removeEventListener("resize", onChange);
		window.removeEventListener("orientationchange", onChange);
	};
}

function getWidth(): number {
	return window.innerWidth;
}

function getHeight(): number {
	return window.innerHeight;
}

function getServerSnapshot(): null {
	return null;
}

function useViewport(): Viewport | null {
	const width = useSyncExternalStore<number | null>(
		subscribeToViewport,
		getWidth,
		getServerSnapshot,
	);
	const height = useSyncExternalStore<number | null>(
		subscribeToViewport,
		getHeight,
		getServerSnapshot,
	);
	return width === null || height === null ? null : { width, height };
}

function isUnsupported(viewport: Viewport): boolean {
	return (
		viewport.width < MIN_WIDTH ||
		viewport.width / viewport.height < MIN_ASPECT_RATIO
	);
}

type MobileWarningProps = {
	children: ReactNode;
};

export function MobileWarning({ children }: MobileWarningProps) {
	const viewport = useViewport();

	if (viewport && isUnsupported(viewport)) {
		return <UnsupportedScreen viewport={viewport} />;
	}
	return <>{children}</>;
}

type UnsupportedScreenProps = {
	viewport: Viewport;
};

function UnsupportedScreen({ viewport }: UnsupportedScreenProps) {
	const tooNarrow = viewport.width < MIN_WIDTH;
	const portrait = viewport.height > viewport.width;
	const rotateOnly = !tooNarrow && portrait;

	return (
		<div className="flex h-svh w-full flex-col items-center justify-center bg-background p-6 text-center">
			<div className="mb-8 inline-flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-warning">
				<span className="size-1.5 animate-pulse rounded-full bg-warning ring-2 ring-warning/30" />
				Display Incompatible
			</div>

			<div className="mb-6 flex size-20 items-center justify-center rounded-full border-2 border-sidebar-border bg-sidebar/40">
				<Icon
					name={rotateOnly ? "screen_rotation" : "desktop_access_disabled"}
					className="text-5xl text-warning"
				/>
			</div>

			<div className="mb-3 flex items-center gap-3">
				<span className="font-bold text-lg leading-none tracking-widest text-primary">
					ROAM
				</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="text-sm uppercase leading-none tracking-widest text-muted-foreground">
					Command Dashboard
				</span>
			</div>

			<h1 className="mb-4 text-2xl font-bold uppercase tracking-wider text-foreground">
				{rotateOnly ? "Rotate Your Device" : "Mobile Not Supported"}
			</h1>

			<p className="max-w-sm text-sm text-muted-foreground">
				{rotateOnly ? (
					<>
						The dispatch command interface requires a landscape orientation.
						Rotate your device to continue.
					</>
				) : (
					<>
						The dispatch command interface requires a landscape display of at
						least{" "}
						<span className="font-medium text-foreground">{MIN_WIDTH}px</span>.
						Switch to a desktop, laptop, or tablet in landscape orientation.
					</>
				)}
			</p>

			<div className="mt-8 grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-md border border-sidebar-border bg-sidebar-border">
				<Spec
					label="Current"
					value={`${viewport.width}×${viewport.height}`}
					tone="danger"
				/>
				<Spec label="Required" value={`≥ ${MIN_WIDTH}px`} tone="muted" />
				<Spec
					label="Mode"
					value={portrait ? "Portrait" : "Landscape"}
					tone={portrait ? "danger" : "primary"}
				/>
			</div>

			<p className="mt-10 text-2xs uppercase tracking-widest text-muted-foreground/60">
				Field responders — use the ROAM mobile app
			</p>
		</div>
	);
}

type SpecTone = "primary" | "warning" | "danger" | "muted";

const specToneClass: Record<SpecTone, string> = {
	primary: "text-primary",
	warning: "text-warning",
	danger: "text-danger",
	muted: "text-foreground",
};

type SpecProps = {
	label: string;
	value: string;
	tone: SpecTone;
};

function Spec({ label, value, tone }: SpecProps) {
	return (
		<div className="bg-sidebar p-3 text-left">
			<div className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/70">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 font-mono text-sm font-medium",
					specToneClass[tone],
				)}
			>
				{value}
			</div>
		</div>
	);
}
