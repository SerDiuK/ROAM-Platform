import bcrypt from "bcryptjs";

// Cost factor 10 → ~10ms per hash on modern hardware; well below
// any login flow timeout. Bumping to 12 if we move to mainnet ops.
const BCRYPT_ROUNDS = 10;

export async function hashPin(pin: string): Promise<string> {
	return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
	return bcrypt.compare(pin, hash);
}
