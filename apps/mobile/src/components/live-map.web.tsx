import type { Telemetry, Vehicle } from "@roam/shared";
import { Text, View, type ViewStyle } from "react-native";

type Props = {
	vehicles: Vehicle[];
	positions?: Map<string, Telemetry>;
	onSelectVehicle?: (vehicleId: string) => void;
	style?: ViewStyle;
};

export function LiveMap(_props: Props): React.JSX.Element {
	return (
		<View className="absolute inset-0 items-center justify-center bg-background p-6">
			<Text className="max-w-xs text-center text-sm text-muted-foreground">
				Map preview is not available on web. Open the app on iOS or Android to
				view the live dispatch map.
			</Text>
		</View>
	);
}
