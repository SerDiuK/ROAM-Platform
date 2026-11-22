import type { Responder } from "@roam/shared";

export function serializeResponder(
	doc: { _id: string } & Record<string, unknown>,
): Responder {
	// Stripped despite `select: false`, in case a caller selected the secret.
	const { encryptedWalletSecret, __v, ...wire } = doc;
	void encryptedWalletSecret;
	void __v;
	// TS can't see that the lean doc matches the Zod-validated wire Responder.
	return wire as unknown as Responder;
}
