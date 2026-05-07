import type { TelemetrySnapshot, Vehicle } from "@roam/shared";
import { formatTime, STATUS_HEX, STATUS_LABEL } from "@roam/ui";
import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { Image, View } from "react-native";
import { LongPressButton } from "@/components/ui/long-press-button";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { api } from "@/lib/api";
import { currentResponderAtom } from "@/state/responder";
import { fetchVehiclesAtom } from "@/state/vehicles";

type Props = {
	vehicle: Vehicle | null;
	telemetry?: TelemetrySnapshot;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function VehicleDetailsSheet({
	vehicle,
	telemetry,
	open,
	onOpenChange,
}: Props): React.JSX.Element {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			{vehicle ? (
				<VehicleDetailsBody
					vehicle={vehicle}
					telemetry={telemetry ?? vehicle.lastTelemetry}
					onClose={() => onOpenChange(false)}
				/>
			) : null}
		</Sheet>
	);
}

type Action = "checkin" | "checkout" | null;

function resolveAction(status: Vehicle["status"]): Action {
	if (status === "available") return "checkin";
	if (status === "in_use") return "checkout";
	return null;
}

function VehicleDetailsBody({
	vehicle,
	telemetry,
	onClose,
}: {
	vehicle: Vehicle;
	telemetry?: TelemetrySnapshot;
	onClose: () => void;
}): React.JSX.Element {
	const responder = useAtomValue(currentResponderAtom);
	const fetchVehicles = useSetAtom(fetchVehiclesAtom);
	const [pending, setPending] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const action = resolveAction(vehicle.status);

	const handleConfirm = async (): Promise<void> => {
		if (!action) return;
		if (!responder) {
			setError("Still signing in — try again in a second");
			return;
		}
		setError(null);
		setPending(true);
		try {
			if (action === "checkin") {
				await api.auth.checkin({
					vehicleId: vehicle._id,
					responderName: responder.name,
				});
			} else {
				await api.auth.checkout({ vehicleId: vehicle._id });
			}
			void fetchVehicles();
			onClose();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setPending(false);
		}
	};

	const idleLabel =
		action === "checkin"
			? "Hold to check in"
			: action === "checkout"
				? "Hold to check out"
				: "Vehicle unavailable";

	const pendingLabel = action === "checkin" ? "Checking in…" : "Checking out…";

	const spec = vehicle.model;
	const hasSpecs =
		spec.topSpeedKph != null ||
		spec.rangeKm != null ||
		spec.payloadKg != null ||
		spec.weightKg != null ||
		spec.batteryKwh != null ||
		spec.drivetrain != null;

	return (
		<View className="gap-4 pb-2">
			<Image
				source={{ uri: spec.imageUrl }}
				className="h-36 w-full rounded-md bg-muted"
				resizeMode="cover"
			/>

			<View>
				<SheetTitle>{vehicle._id}</SheetTitle>
				<Text className="text-xs text-muted-foreground">
					{spec.manufacturer} {spec.name}
				</Text>
				{spec.description ? (
					<Text className="mt-2 text-sm text-muted-foreground">
						{spec.description}
					</Text>
				) : null}
			</View>

			<View className="gap-2">
				<DetailRow
					label="Status"
					value={STATUS_LABEL[vehicle.status]}
					valueColor={STATUS_HEX[vehicle.status]}
				/>
				{vehicle.currentResponderId ? (
					<DetailRow label="Responder" value={vehicle.currentResponderId} />
				) : null}
				{telemetry ? (
					<>
						<DetailRow
							label="Speed"
							value={`${telemetry.speed.toFixed(1)} km/h`}
						/>
						<DetailRow
							label="Battery"
							value={
								telemetry.batteryPct != null ? `${telemetry.batteryPct}%` : "—"
							}
						/>
						<DetailRow
							label="Last update"
							value={formatTime(telemetry.timestamp)}
						/>
					</>
				) : (
					<Text className="text-sm text-muted-foreground">
						No telemetry yet
					</Text>
				)}
			</View>

			{hasSpecs ? (
				<View className="gap-2 border-t border-border/50 pt-3">
					{spec.topSpeedKph != null ? (
						<DetailRow label="Top speed" value={`${spec.topSpeedKph} km/h`} />
					) : null}
					{spec.rangeKm != null ? (
						<DetailRow label="Range" value={`${spec.rangeKm} km`} />
					) : null}
					{spec.payloadKg != null ? (
						<DetailRow label="Payload" value={`${spec.payloadKg} kg`} />
					) : null}
					{spec.weightKg != null ? (
						<DetailRow label="Weight" value={`${spec.weightKg} kg`} />
					) : null}
					{spec.drivetrain ? (
						<DetailRow label="Drivetrain" value={spec.drivetrain} />
					) : null}
					{spec.batteryKwh != null ? (
						<DetailRow label="Capacity" value={`${spec.batteryKwh} kWh`} />
					) : null}
				</View>
			) : null}

			{error ? <Text className="text-sm text-destructive">{error}</Text> : null}

			<LongPressButton
				label={pending ? pendingLabel : idleLabel}
				activeLabel={
					action === "checkin"
						? "Checking in…"
						: action === "checkout"
							? "Checking out…"
							: undefined
				}
				onConfirm={() => {
					void handleConfirm();
				}}
				disabled={action === null || pending}
				variant={action === "checkout" ? "destructive" : "default"}
			/>
		</View>
	);
}

function DetailRow({
	label,
	value,
	valueColor,
}: {
	label: string;
	value: string;
	valueColor?: string;
}): React.JSX.Element {
	return (
		<View className="flex-row items-center justify-between">
			<Text className="text-sm text-muted-foreground">{label}</Text>
			<Text
				className="text-sm font-medium text-foreground"
				style={valueColor ? { color: valueColor } : undefined}
			>
				{value}
			</Text>
		</View>
	);
}
