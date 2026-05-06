import { oc } from "@orpc/contract";
import { z } from "zod";
import { BriefingSchema } from "./briefing";
import { CoordSchema } from "./coord";
import {
	DispatchClearRequestSchema,
	DispatchConfirmRequestSchema,
	DispatchListRequestSchema,
	DispatchSchema,
} from "./dispatch";
import {
	DispatchRespondRequestSchema,
	DispatchResponseSchema,
} from "./dispatchResponse";
import {
	CheckinRequestSchema,
	CheckoutRequestSchema,
	EnrolRequestSchema,
	MeResponseSchema,
	ResponderSchema,
	SignInRequestSchema,
	SignInResponseSchema,
	UpsertPushTokenRequestSchema,
} from "./responder";
import {
	IncidentIngestRequestSchema,
	IncidentSchema,
} from "./incident";
import { IncidentEventSchema } from "./incidentEvent";
import { TelemetrySchema } from "./telemetry";
import { VehicleSchema, VehicleStatusSchema } from "./vehicle";

// --- Response fragments ---

const HealthResponseSchema = z.object({
	status: z.literal("ok"),
	timestamp: z.coerce.date(),
});

// AD-22: checkin/checkout return the affected Vehicle (with currentResponderId
// populated from the responder lookup) — sessions no longer exist as a
// separate object.
const CheckinResponseSchema = z.object({
	vehicle: VehicleSchema,
	responder: ResponderSchema.pick({ _id: true, name: true, role: true }),
});

const CheckoutResponseSchema = z.object({
	vehicle: VehicleSchema,
});

const ResponderResponseSchema = z.object({
	responder: ResponderSchema,
});

const VehicleResponseSchema = z.object({
	vehicle: VehicleSchema,
});

const VehicleUpsertInputSchema = z.object({
	callsign: z.string().min(1),
	status: VehicleStatusSchema.optional(),
	modelSlug: z.string().optional(),
	lastTelemetry: TelemetrySchema.pick({
		lat: true,
		lon: true,
		speed: true,
		heading: true,
		batteryPct: true,
	})
		.partial({ speed: true, heading: true, batteryPct: true })
		.optional(),
});

const IdParamSchema = z.object({ id: z.string() });

// Returned by incidents.get — the Briefing is optional because the agent runs
// async after ingest, so callers immediately after ingest see briefing=null
// and learn it's ready via the WS broadcaster.
const IncidentWithBriefingResponseSchema = z.object({
	incident: IncidentSchema,
	briefing: BriefingSchema.optional(),
});

// Pair returned by dispatch.respond — caller wants both the just-persisted
// response row and the (possibly newly-claimed) dispatch state in one shot so
// the mobile UI can render the post-accept screen without a second fetch.
const DispatchRespondResponseSchema = z.object({
	response: DispatchResponseSchema,
	dispatch: DispatchSchema,
});

// Returned by dispatch.get — the dispatch plus all responses recorded against
// it (accepts and declines). DispatchTracker (AD-15) renders this as a live
// row-per-responder list.
const DispatchWithResponsesResponseSchema = z.object({
	dispatch: DispatchSchema,
	responses: DispatchResponseSchema.array(),
});

// --- Contract ---

export const contract = {
	health: {
		check: oc
			.route({ method: "GET", path: "/health", summary: "Health check" })
			.output(HealthResponseSchema),
	},

	responders: {
		list: oc
			.route({
				method: "GET",
				path: "/api/responders",
				summary: "List all responders",
			})
			.output(ResponderSchema.array()),

		enrol: oc
			.route({
				method: "POST",
				path: "/api/responders/enrol",
				summary: "Enrol a responder (NFC / PIN)",
			})
			.input(EnrolRequestSchema)
			.output(ResponderResponseSchema),

		upsertPushToken: oc
			.route({
				method: "POST",
				path: "/api/responders/push-token",
				summary: "Register an Expo push token for a responder",
			})
			.input(UpsertPushTokenRequestSchema)
			.output(z.object({ tokenCount: z.number().int().nonnegative() })),
	},

	auth: {
		signIn: oc
			.route({
				method: "POST",
				path: "/api/auth/sign-in",
				summary: "Sign in a responder with name + PIN",
			})
			.input(SignInRequestSchema)
			.output(SignInResponseSchema),

		me: oc
			.route({
				method: "GET",
				path: "/api/auth/me",
				summary: "Resolve the responder for the current session token",
			})
			.output(MeResponseSchema),

		checkin: oc
			.route({
				method: "POST",
				path: "/api/auth/checkin",
				summary: "Pair a responder to a vehicle for their shift",
			})
			.input(CheckinRequestSchema)
			.output(CheckinResponseSchema),

		checkout: oc
			.route({
				method: "POST",
				path: "/api/auth/checkout",
				summary: "Release the responder↔vehicle pairing",
			})
			.input(CheckoutRequestSchema)
			.output(CheckoutResponseSchema),
	},

	vehicles: {
		list: oc
			.route({
				method: "GET",
				path: "/api/vehicles",
				summary: "List all vehicles",
			})
			.output(VehicleSchema.array()),

		get: oc
			.route({
				method: "GET",
				path: "/api/vehicles/{id}",
				summary: "Get vehicle by id",
			})
			.input(IdParamSchema)
			.output(VehicleSchema),

		upsertByCallsign: oc
			.route({
				method: "PUT",
				path: "/api/vehicles/by-callsign/{callsign}",
				summary: "Upsert a vehicle keyed by its callsign",
			})
			.input(VehicleUpsertInputSchema)
			.output(VehicleResponseSchema),
	},

	incidents: {
		list: oc
			.route({
				method: "GET",
				path: "/api/incidents",
				summary: "List recent incidents (newest first)",
			})
			.output(IncidentSchema.array()),

		get: oc
			.route({
				method: "GET",
				path: "/api/incidents/{id}",
				summary: "Get incident by id (with briefing if ready)",
			})
			.input(IdParamSchema)
			.output(IncidentWithBriefingResponseSchema),

		ingest: oc
			.route({
				method: "POST",
				path: "/api/incidents/ingest",
				summary:
					"Ingest a 911 call (audio or transcript) and start the briefing agent",
			})
			.input(IncidentIngestRequestSchema)
			.output(IncidentSchema),
	},

	dispatch: {
		list: oc
			.route({
				method: "GET",
				path: "/api/dispatch",
				summary:
					"List dispatches (active by default; includeCleared=true to also return terminal states)",
			})
			.input(DispatchListRequestSchema)
			.output(DispatchSchema.array()),

		get: oc
			.route({
				method: "GET",
				path: "/api/dispatch/{id}",
				summary: "Get a dispatch with all responses",
			})
			.input(IdParamSchema)
			.output(DispatchWithResponsesResponseSchema),

		confirm: oc
			.route({
				method: "POST",
				path: "/api/dispatch/confirm",
				summary:
					"Confirm a briefing → create a Dispatch and push to recommended responders",
			})
			.input(DispatchConfirmRequestSchema)
			.output(DispatchSchema),

		respond: oc
			.route({
				method: "POST",
				path: "/api/dispatch/respond",
				summary: "Accept or decline a dispatch (first-to-claim)",
			})
			.input(DispatchRespondRequestSchema)
			.output(DispatchRespondResponseSchema),

		clear: oc
			.route({
				method: "POST",
				path: "/api/dispatch/clear",
				summary:
					"Mark a claimed dispatch as cleared (scene cleared) and resolve the incident",
			})
			.input(DispatchClearRequestSchema)
			.output(DispatchSchema),
	},

	// On-chain incident event log: one row per (incident, kind, responder) tuple.
	// Dispatcher gets the full timeline by incident; mobile gets only the
	// signed-in responder's events plus the incident-scoped events for incidents
	// they're involved in.
	events: {
		listByIncident: oc
			.route({
				method: "GET",
				path: "/api/events/by-incident/{incidentId}",
				summary: "List all events for an incident (dispatcher timeline)",
			})
			.input(z.object({ incidentId: z.string() }))
			.output(IncidentEventSchema.array()),

		listForResponder: oc
			.route({
				method: "GET",
				path: "/api/events/mine",
				summary:
					"List events relevant to the signed-in responder (their per-responder events plus incident-scoped events on incidents they're involved in)",
			})
			.output(IncidentEventSchema.array()),
	},
};

export type Contract = typeof contract;

// Re-exports used elsewhere in the codebase so we don't leak the zod import path
export { CoordSchema };
