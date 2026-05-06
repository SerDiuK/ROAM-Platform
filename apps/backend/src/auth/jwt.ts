import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const ISSUER = "roam-backend";

export type SessionClaims = {
	sub: string; // responder id
	name: string;
	role: "responder" | "dispatcher";
};

function encodeSecret(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export async function signSessionToken(
	claims: SessionClaims,
	secret: string,
	ttlSecs: number,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({ name: claims.name, role: claims.role })
		.setProtectedHeader({ alg: ALG })
		.setSubject(claims.sub)
		.setIssuedAt(now)
		.setExpirationTime(now + ttlSecs)
		.setIssuer(ISSUER)
		.sign(encodeSecret(secret));
}

export async function verifySessionToken(
	token: string,
	secret: string,
): Promise<SessionClaims> {
	const { payload } = await jwtVerify(token, encodeSecret(secret), {
		algorithms: [ALG],
		issuer: ISSUER,
	});
	if (typeof payload.sub !== "string") {
		throw new Error("token missing sub");
	}
	if (typeof payload.name !== "string") {
		throw new Error("token missing name");
	}
	if (payload.role !== "responder" && payload.role !== "dispatcher") {
		throw new Error("token has invalid role");
	}
	return {
		sub: payload.sub,
		name: payload.name,
		role: payload.role,
	};
}
