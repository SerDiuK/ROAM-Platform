import { vi } from "vitest";
export declare function getDefaultSpec(): Promise<import("mongoose").Document<unknown, {}, {
    _id: string;
    name: string;
    slug: string;
    manufacturer: string;
    imageUrl: string;
    description?: string | undefined;
    category?: string | undefined;
    topSpeedKph?: number | undefined;
    rangeKm?: number | undefined;
    payloadKg?: number | undefined;
    weightKg?: number | undefined;
    drivetrain?: string | undefined;
    batteryKwh?: number | undefined;
    productUrl?: string | undefined;
}, {}, import("mongoose").DefaultSchemaOptions> & {
    _id: string;
    name: string;
    slug: string;
    manufacturer: string;
    imageUrl: string;
    description?: string | undefined;
    category?: string | undefined;
    topSpeedKph?: number | undefined;
    rangeKm?: number | undefined;
    payloadKg?: number | undefined;
    weightKg?: number | undefined;
    drivetrain?: string | undefined;
    batteryKwh?: number | undefined;
    productUrl?: string | undefined;
} & Required<{
    _id: string;
}> & {
    __v: number;
} & {
    id: string;
}>;
export declare function makeResponder(overrides?: Partial<{
    name: string;
    role: "responder" | "dispatcher";
    availability: "available" | "occupied" | "off_duty" | "unavailable";
    currentVehicleId: string | null;
}>): Promise<import("mongoose").Document<unknown, {}, {
    _id: string;
    name: string;
    role: "responder" | "dispatcher";
    availability: "available" | "occupied" | "off_duty" | "unavailable";
    displayName?: string | null | undefined;
    capabilities?: "medic"[] | null | undefined;
    pushTokens?: string[] | null | undefined;
    walletAddress?: string | null | undefined;
    currentVehicleId?: string | null | undefined;
    encryptedWalletSecret?: string | null | undefined;
    pinHash?: string | null | undefined;
}, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<{
    _id: string;
    name: string;
    role: "responder" | "dispatcher";
    availability: "available" | "occupied" | "off_duty" | "unavailable";
    displayName?: string | null | undefined;
    capabilities?: "medic"[] | null | undefined;
    pushTokens?: string[] | null | undefined;
    walletAddress?: string | null | undefined;
    currentVehicleId?: string | null | undefined;
    encryptedWalletSecret?: string | null | undefined;
    pinHash?: string | null | undefined;
} & Required<{
    _id: string;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}>;
export declare function makeVehicle(overrides?: Partial<{
    callsign: string;
    status: "available" | "in_use" | "locked" | "offline";
    lastTelemetry: {
        lat: number;
        lon: number;
        speed: number;
        heading: number;
        timestamp: Date;
    };
}>): Promise<import("mongoose").Document<unknown, {}, {
    status: "available" | "in_use" | "locked" | "offline";
    createdAt: NativeDate;
    callsign: string;
    model: import("mongoose").Types.ObjectId;
    assignedResponderIds?: string[] | null | undefined;
    lastTelemetry?: {
        lat: number;
        lon: number;
        speed: number;
        heading: number;
        timestamp: NativeDate;
        location?: {
            type: "Point";
            coordinates: number[];
        } | null | undefined;
        batteryPct?: number | null | undefined;
    } | null | undefined;
}, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<{
    status: "available" | "in_use" | "locked" | "offline";
    createdAt: NativeDate;
    callsign: string;
    model: import("mongoose").Types.ObjectId;
    assignedResponderIds?: string[] | null | undefined;
    lastTelemetry?: {
        lat: number;
        lon: number;
        speed: number;
        heading: number;
        timestamp: NativeDate;
        location?: {
            type: "Point";
            coordinates: number[];
        } | null | undefined;
        batteryPct?: number | null | undefined;
    } | null | undefined;
} & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}>;
export declare function makeFakeBroadcaster(): {
    addClient: ReturnType<typeof vi.fn>;
    removeClient: ReturnType<typeof vi.fn>;
    broadcast: ReturnType<typeof vi.fn>;
};
export declare function makeFakeTranscriber(transcript?: string): {
    transcribeAudioFile: ReturnType<typeof vi.fn>;
    transcribeAudioStream: ReturnType<typeof vi.fn>;
};
export declare function makeFakeLogger(): {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    trace: ReturnType<typeof vi.fn>;
    fatal: ReturnType<typeof vi.fn>;
    child: () => ReturnType<typeof makeFakeLogger>;
    level: string;
    silent: () => void;
};
//# sourceMappingURL=factories.d.ts.map