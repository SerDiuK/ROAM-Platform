import type {
	Incident,
	IncidentUrgency,
	Telemetry,
	Vehicle,
} from "@roam/shared";
import { color, STATUS_HEX, URGENCY_HEX } from "@roam/ui";
import * as Location from "expo-location";
import { LocateFixed, Siren } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
	Platform,
	Pressable,
	StyleSheet,
	View,
	type ViewStyle,
} from "react-native";
import MapView, {
	Marker,
	Polyline,
	PROVIDER_DEFAULT,
	PROVIDER_GOOGLE,
} from "react-native-maps";
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DISPATCH_MAP_STYLE } from "@/lib/map-style";

const LOCATE_ICON_COLOR = color("background");
const ROUTE_STROKE = color("primary");
const MARKER_ICON_COLOR = color("background");

const INITIAL_REGION = {
	latitude: 25.7617,
	longitude: -80.1918,
	latitudeDelta: 0.06,
	longitudeDelta: 0.06,
};

const isAndroid = Platform.OS === "android";

type LatLng = { latitude: number; longitude: number };

type Props = {
	vehicles: Vehicle[];
	positions?: Map<string, Telemetry>;
	route?: LatLng[] | null;
	incident?: Incident | null;
	style?: ViewStyle;
};

export function LiveMap({
	vehicles,
	positions,
	route,
	incident,
	style,
}: Props): React.JSX.Element {
	const mapRef = useRef<MapView>(null);
	const [hasLocationPermission, setHasLocationPermission] = useState(false);
	const insets = useSafeAreaInsets();

	const handleLocate = async (): Promise<void> => {
		let granted = hasLocationPermission;
		if (!granted) {
			const { status } = await Location.requestForegroundPermissionsAsync();
			granted = status === "granted";
			setHasLocationPermission(granted);
		}
		if (!granted) return;
		const pos = await Location.getCurrentPositionAsync({
			accuracy: Location.Accuracy.High,
		});
		mapRef.current?.animateToRegion(
			{
				latitude: pos.coords.latitude,
				longitude: pos.coords.longitude,
				latitudeDelta: 0.01,
				longitudeDelta: 0.01,
			},
			800,
		);
	};

	const incidentLocation = incident?.classification?.location;
	const incidentUrgency: IncidentUrgency =
		incident?.classification?.urgency ?? 2;
	const incidentPulse =
		incident?.status === "live" || incident?.status === "pending";

	// Keyed on lat/lon so re-renders that don't move the scene don't re-run the camera animation.
	const incidentLat = incidentLocation?.lat;
	const incidentLon = incidentLocation?.lon;
	useEffect(() => {
		if (incidentLat == null || incidentLon == null) return;
		mapRef.current?.animateToRegion(
			{
				latitude: incidentLat,
				longitude: incidentLon,
				latitudeDelta: 0.02,
				longitudeDelta: 0.02,
			},
			800,
		);
	}, [incidentLat, incidentLon]);

	return (
		<View style={[StyleSheet.absoluteFillObject, style]}>
			<MapView
				ref={mapRef}
				style={StyleSheet.absoluteFillObject}
				provider={isAndroid ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
				initialRegion={INITIAL_REGION}
				customMapStyle={isAndroid ? DISPATCH_MAP_STYLE : undefined}
				showsCompass={false}
				showsMyLocationButton={false}
				showsScale={false}
				showsPointsOfInterest={false}
				showsTraffic={false}
				showsUserLocation={hasLocationPermission}
			>
				{vehicles.map((vehicle) => {
					const telemetry =
						positions?.get(vehicle._id) ?? vehicle.lastTelemetry;
					if (!telemetry) return null;
					const color = STATUS_HEX[vehicle.status];
					return (
						<Marker
							key={vehicle._id}
							identifier={vehicle._id}
							coordinate={{ latitude: telemetry.lat, longitude: telemetry.lon }}
							anchor={{ x: 0.5, y: 0.5 }}
						>
							<View
								className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
								style={{ backgroundColor: color }}
							/>
						</Marker>
					);
				})}
				{route && route.length > 1 ? (
					<Polyline
						coordinates={route}
						strokeColor={ROUTE_STROKE}
						strokeWidth={4}
					/>
				) : null}
				{incidentLocation ? (
					<Marker
						identifier="incident-destination"
						coordinate={{
							latitude: incidentLocation.lat,
							longitude: incidentLocation.lon,
						}}
						anchor={{ x: 0.5, y: 0.5 }}
					>
						<IncidentMarkerVisual
							urgency={incidentUrgency}
							pulse={incidentPulse}
						/>
					</Marker>
				) : null}
			</MapView>
			<Pressable
				accessibilityLabel="Center map on my location"
				accessibilityRole="button"
				onPress={handleLocate}
				className="absolute right-3 h-11 w-11 items-center justify-center rounded-md bg-white shadow-md"
				style={{ bottom: insets.bottom + 16 }}
			>
				<LocateFixed color={LOCATE_ICON_COLOR} size={20} />
			</Pressable>
		</View>
	);
}

function IncidentMarkerVisual({
	urgency,
	pulse,
}: {
	urgency: IncidentUrgency;
	pulse: boolean;
}): React.JSX.Element {
	const fill = URGENCY_HEX[urgency];
	const scale = useSharedValue(1);
	const opacity = useSharedValue(0.55);

	useEffect(() => {
		if (!pulse) {
			scale.value = 1;
			opacity.value = 0;
			return;
		}
		scale.value = withRepeat(withTiming(2, { duration: 1500 }), -1, false);
		opacity.value = withRepeat(withTiming(0, { duration: 1500 }), -1, false);
		return () => {
			cancelAnimation(scale);
			cancelAnimation(opacity);
		};
	}, [pulse, scale, opacity]);

	const pulseStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));

	return (
		<View className="h-12 w-12 items-center justify-center">
			{pulse ? (
				<Animated.View
					pointerEvents="none"
					style={[
						StyleSheet.absoluteFillObject,
						{
							borderRadius: 9999,
							backgroundColor: `${fill}55`,
						},
						pulseStyle,
					]}
				/>
			) : null}
			<View
				className="h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-md"
				style={{ backgroundColor: fill }}
			>
				<Siren color={MARKER_ICON_COLOR} size={12} />
			</View>
		</View>
	);
}
