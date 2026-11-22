import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Coord, Incident, Vehicle } from "@roam/shared";
import { color, STATUS_HEX } from "@roam/ui";
import { useAtomValue } from "jotai";
import { History } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { DispatchSheet } from "@/features/dispatch/dispatch-sheet/dispatch-sheet";
import { DispatchNotifications } from "@/features/dispatch/notifications";
import { useDispatchInbox } from "@/features/dispatch/use-dispatch-inbox";
import { LiveMap } from "@/features/live-map/live-map";
import { useRouteToIncident } from "@/features/live-map/use-route-to-incident";
import { MyEventsSheet } from "@/features/my-events-sheet";
import type { RootStackParamList } from "@/navigators/navigation-types";
import { currentResponderAtom } from "@/state/responder";
import { connectedAtom, telemetryAtom, vehiclesAtom } from "@/state/vehicles";

export function HomeScreen(): React.JSX.Element {
	const vehicles = useAtomValue(vehiclesAtom);
	const positions = useAtomValue(telemetryAtom);
	const connected = useAtomValue(connectedAtom);
	const responder = useAtomValue(currentResponderAtom);
	const [eventsOpen, setEventsOpen] = React.useState(false);
	const navigation =
		useNavigation<NativeStackNavigationProp<RootStackParamList>>();

	const inbox = useDispatchInbox({ responderId: responder?._id });
	const inboxState = inbox.state;

	const isClaimed = inboxState.kind === "claimed";
	const claimedData = isClaimed ? inboxState.data : null;

	const activeIncident = React.useMemo<Incident | null>(() => {
		if ("data" in inboxState) return inboxState.data.incident;
		return null;
	}, [inboxState]);

	const activeIncidentLocation = React.useMemo<Coord | null>(
		() => activeIncident?.classification?.location ?? null,
		[activeIncident],
	);

	const activeVehicle = React.useMemo<Vehicle | null>(() => {
		if (!claimedData) return null;
		for (const vid of claimedData.dispatch.assignedVehicleIds) {
			const v = vehicles.find((x) => x._id === vid);
			if (v) return v;
		}
		return null;
	}, [claimedData, vehicles]);

	const activeOrigin = React.useMemo<Coord | null>(() => {
		if (!activeVehicle) return null;
		const live = positions.get(activeVehicle._id);
		if (live) return { lat: live.lat, lon: live.lon };
		const last = activeVehicle.lastTelemetry;
		if (last) return { lat: last.lat, lon: last.lon };
		return null;
	}, [activeVehicle, positions]);

	const route = useRouteToIncident({
		origin: activeOrigin,
		destination: activeIncidentLocation,
		enabled: isClaimed,
	});

	const transmitting = positions.size;

	return (
		<View className="flex-1 bg-background">
			<LiveMap
				vehicles={vehicles}
				positions={positions}
				route={route.coordinates}
				incident={activeIncident}
			/>

			<SafeAreaView
				edges={["top"]}
				pointerEvents="box-none"
				className="absolute inset-x-0 top-0"
			>
				<View className="mx-3 mt-2 flex-row items-start justify-between">
					<Pressable
						onPress={() => navigation.navigate("Profile")}
						className="rounded-lg bg-black/80 px-3 py-2"
						accessibilityLabel="Open profile"
					>
						<Text className="text-xs text-neutral-300">Responder</Text>
						<Text className="text-xs font-sans-semibold text-white">
							{responder?.displayName ?? responder?.name ?? "Signing in…"}
						</Text>
					</Pressable>

					<View className="items-end gap-2">
						<View className="rounded-lg bg-black/80 px-3 py-2">
							<View className="flex-row items-center gap-2">
								<View
									className="h-2 w-2 rounded-full"
									style={{
										backgroundColor: connected
											? STATUS_HEX.available
											: STATUS_HEX.locked,
									}}
								/>
								<Text className="text-xs text-white">
									{connected ? "Connected" : "Offline"}
								</Text>
							</View>
							<Text className="text-xs text-neutral-300">
								{transmitting} transmitting / {vehicles.length} total
							</Text>
						</View>
						<Button
							onPress={() => setEventsOpen(true)}
							size="sm"
							accessibilityLabel="Open my events"
						>
							<History size={14} color={color("primaryForeground")} />
							<Text className="text-xs font-sans-semibold">My events</Text>
						</Button>
					</View>
				</View>
			</SafeAreaView>

			<MyEventsSheet open={eventsOpen} onOpenChange={setEventsOpen} />

			<DispatchSheet
				state={inbox.state}
				onAccept={() => {
					void inbox.acceptDispatch();
				}}
				onDecline={() => {
					void inbox.declineDispatch();
				}}
				onClear={() => {
					void inbox.clearDispatch();
				}}
				onDismiss={inbox.dismiss}
			/>

			<DispatchNotifications
				onDispatch={(dispatchId) => {
					void inbox.showFor(dispatchId);
				}}
			/>
		</View>
	);
}
