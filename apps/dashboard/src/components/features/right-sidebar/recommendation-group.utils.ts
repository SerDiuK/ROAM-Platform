import type { Responder, Vehicle } from "@roam/shared";

type CrewedUnit = {
	vehicle: Vehicle;
	crew: string[];
};

export function resolveUnits(
	vehicleIds: string[],
	responderIds: string[],
	vehicles: Vehicle[],
	responderMap: Map<string, Responder>,
): CrewedUnit[] {
	const crewIds = new Set(responderIds);
	return vehicleIds.flatMap((id) => {
		const vehicle = vehicles.find((v) => v._id === id);
		if (!vehicle) return [];
		const crew = (vehicle.assignedResponderIds ?? [])
			.filter((responderId) => crewIds.has(responderId))
			.map((responderId) => {
				const responder = responderMap.get(responderId);
				return responder?.displayName ?? responder?.name;
			})
			.filter((name): name is string => name !== undefined);
		return [{ vehicle, crew }];
	});
}

export function formatUnitsAndCrew(
	vehicleIds: string[],
	responderIds: string[],
): string {
	const units = vehicleIds.length === 1 ? "Unit" : "Units";
	return `${vehicleIds.length} ${units} · ${responderIds.length} Crew`;
}
