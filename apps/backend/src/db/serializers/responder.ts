import type { Responder } from "@roam/shared";

export function serializeResponder(
	doc: { _id: string } & Record<string, unknown>,
): Responder {
	const { __v, ...wire } = doc;
	// TS can't see that the lean doc matches the Zod-validated wire Responder.
	return wire as unknown as Responder;
}
