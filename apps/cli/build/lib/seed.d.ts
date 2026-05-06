export type SeededBriefing = {
    incidentId: string;
    briefingId: string;
    recommendedResponderIds: string[];
    recommendedVehicleIds: string[];
    summary: string;
};
export type SeedOptions = {
    transcript?: string;
    summary?: string;
    incidentType?: string;
    totalUsdc?: number;
    responderCount?: number;
    vehicleCount?: number;
};
export declare function seedBriefing(options?: SeedOptions): Promise<SeededBriefing>;
//# sourceMappingURL=seed.d.ts.map