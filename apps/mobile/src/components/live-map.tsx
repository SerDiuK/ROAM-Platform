import type { Telemetry, Vehicle } from "@roam/shared";
import { color, STATUS_HEX } from "@roam/ui";
import * as Location from "expo-location";
import { LocateFixed } from "lucide-react-native";
import { useRef, useState } from "react";
import {
	Platform,
	Pressable,
	StyleSheet,
	View,
	type ViewStyle,
} from "react-native";
import MapView, {
	Marker,
	PROVIDER_DEFAULT,
	PROVIDER_GOOGLE,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DISPATCH_MAP_STYLE } from "@/lib/map-style";

const LOCATE_ICON_COLOR = color("background", "dark");

const INITIAL_REGION = {
	latitude: 25.7617,
	longitude: -80.1918,
	latitudeDelta: 0.06,
	longitudeDelta: 0.06,
};

const isAndroid = Platform.OS === "android";

type Props = {
	vehicles: Vehicle[];
	positions?: Map<string, Telemetry>;
	onSelectVehicle?: (vehicleId: string) => void;
	style?: ViewStyle;
};

export function LiveMap({
	vehicles,
	positions,
	onSelectVehicle,
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

	return (
		<View style={[StyleSheet.absoluteFillObject, style]}>
			<MapView
				ref={mapRef}
				style={StyleSheet.absoluteFillObject}
				provider={isAndroid ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
				initialRegion={INITIAL_REGION}
				customMapStyle={isAndroid ? DISPATCH_MAP_STYLE : undefined}
				showsCompass
				showsScale
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
							onPress={() => onSelectVehicle?.(vehicle._id)}
						>
							<View
								className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
								style={{ backgroundColor: color }}
							/>
						</Marker>
					);
				})}
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
