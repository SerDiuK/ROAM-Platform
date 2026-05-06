import type { Responder } from "@roam/shared";

// Responder._id is overridden to String in the Mongoose schema (see
// db/models/responder.ts), so .lean() returns a string `_id` directly — no
// ObjectId hex conversion needed (unlike serializeVehicle). The cast at the
// bottom is the documented .lean() ↔ Zod-validated wire-shape gap: TS sees
// the lean type as `{ _id: string; ... } & mongoose internals`, but the wire
// shape is the narrower @roam/shared `Responder`.
//
// `pinHash` and `encryptedWalletSecret` carry `select: false` on the schema,
// so they should never reach the serializer. We strip them defensively
// anyway — a future caller doing `.select("+pinHash")` for a verify path
// shouldn't accidentally leak the hash through a wire response.
export function serializeResponder(
	doc: { _id: string } & Record<string, unknown>,
): Responder {
	const { pinHash, encryptedWalletSecret, __v, ...wire } = doc;
	void pinHash;
	void encryptedWalletSecret;
	void __v;
	return wire as unknown as Responder;
}
