import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";
export async function getDefaultSpec() {
    const existing = await VehicleSpecModel.findOne({ slug: "ambulance-type-1" });
    if (existing)
        return existing;
    return new VehicleSpecModel({
        slug: "ambulance-type-1",
        manufacturer: "Wheeled Coach",
        name: "Type I Ambulance",
        imageUrl: "https://example.com/ambulance.png",
    }).save();
}
export async function makeResponder(overrides = {}) {
    return new ResponderModel({
        _id: randomUUID(),
        name: overrides.name ?? `RSP-${randomUUID().slice(0, 6)}`,
        role: overrides.role ?? "responder",
        availability: overrides.availability ?? "available",
        currentVehicleId: overrides.currentVehicleId ?? null,
    }).save();
}
export async function makeVehicle(overrides = {}) {
    const spec = await getDefaultSpec();
    return new VehicleModel({
        callsign: overrides.callsign ?? `V-${randomUUID().slice(0, 6)}`,
        model: spec._id,
        status: overrides.status ?? "available",
        lastTelemetry: overrides.lastTelemetry,
    }).save();
}
export function makeFakeBroadcaster() {
    return { addClient: vi.fn(), removeClient: vi.fn(), broadcast: vi.fn() };
}
export function makeFakeTranscriber(transcript = "fake transcript") {
    return {
        transcribeAudioFile: vi.fn(async () => ({
            transcript,
            confidence: 0.95,
            utterances: [],
        })),
        transcribeAudioStream: vi.fn(async () => transcript),
    };
}
export function makeFakeLogger() {
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: () => logger,
        level: "silent",
        silent: () => { },
    };
    return logger;
}
//# sourceMappingURL=factories.js.map