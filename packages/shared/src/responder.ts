import { z } from "zod";

export const RESPONDER_AVAILABILITIES = [
	"available",
	"occupied",
	"off_duty",
	"unavailable",
] as const;
export const ResponderAvailabilitySchema = z.enum(RESPONDER_AVAILABILITIES);
export type ResponderAvailability = z.infer<typeof ResponderAvailabilitySchema>;

export const RESPONDER_CAPABILITIES = ["medic"] as const;
export const ResponderCapabilitySchema = z.enum(RESPONDER_CAPABILITIES);
export type ResponderCapability = z.infer<typeof ResponderCapabilitySchema>;

export const ResponderSchema = z.object({
	_id: z.string(),
	name: z.string(),
	displayName: z.string().optional(),
	role: z.enum(["responder", "dispatcher"]),
	availability: ResponderAvailabilitySchema,
	capabilities: z.array(ResponderCapabilitySchema).optional(),
	walletAddress: z.string().optional(),
	currentVehicleId: z.string().nullable().optional(),
});
export type Responder = z.infer<typeof ResponderSchema>;

export const EnrolRequestSchema = z.object({
	name: z.string(),
	role: z.enum(["responder", "dispatcher"]),
	availability: ResponderAvailabilitySchema,
});

export const UpsertPushTokenRequestSchema = z.object({
	token: z.string().min(1),
});

export const SiwsChallengeRequestSchema = z.object({});

export const SiwsChallengeResponseSchema = z.object({
	nonce: z.string().min(1),
	domain: z.string().min(1),
	statement: z.string().min(1),
	expiresAt: z.string(),
});
export type SiwsChallengeResponse = z.infer<typeof SiwsChallengeResponseSchema>;

// signedMessage, signature and address are base64, as MWA returns them (address isn't base58).
export const SiwsVerifyRequestSchema = z.object({
	signedMessage: z.string().min(1),
	signature: z.string().min(1),
	address: z.string().min(1),
	name: z.string().min(1).optional(),
});

export const SiwsVerifyResponseSchema = z.object({
	token: z.string(),
	responder: ResponderSchema,
});

export const WALLET_UNBOUND = "WALLET_UNBOUND";
export const RESPONDER_ALREADY_BOUND = "RESPONDER_ALREADY_BOUND";

export const MeResponseSchema = z.object({
	responder: ResponderSchema,
});

export const CheckinRequestSchema = z.object({
	vehicleId: z.string(),
	responderName: z.string(),
});

export const CheckoutRequestSchema = z.object({
	vehicleId: z.string(),
});
