import type { Responder } from "@roam/shared";

// Responder._id is overridden to String in the Mongoose schema (see
// db/models/responder.ts), so .lean() returns a string `_id` directly — no
// ObjectId hex conversion needed (unlike serializeVehicle). The cast at the
// bottom is the documented .lean() ↔ Zod-validated wire-shape gap: TS sees
// the lean type as `{ _id: string; ... } & mongoose internals`, but the wire
// shape is the narrower @roam/shared `Responder`.
//
// `encryptedWalletSecret` carries `select: false` on the schema so it should
// never reach the serializer. We strip it defensively anyway — a future
// caller doing `.select("+encryptedWalletSecret")` for the wallet provider
// shouldn't accidentally leak ciphertext through a wire response.
export function serializeResponder(
	doc: { _id: string } & Record<string, unknown>,
): Responder {
	const { encryptedWalletSecret, __v, ...wire } = doc;
	void encryptedWalletSecret;
	void __v;
	return wire as unknown as Responder;
}
