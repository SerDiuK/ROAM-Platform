import { ORPCError, implement } from "@orpc/server";
import { contract } from "@roam/shared";
import type { AuthedUser, RpcContext } from "./context.js";

export const os = implement(contract).$context<RpcContext>();

// The single auth gate left in the system. Applied to:
//   - responders.upsertPushToken — device-to-responder push binding
//   - auth.me                    — token validation on mobile cold start
// All other RPC procedures are public for the hackathon demo. A more potent
// auth mechanism (likely org-issued credentials + role-based gates across the
// full surface) is planned for post-hackathon.
const requireUser = os.middleware(async ({ context, next }) => {
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Sign in to access this resource",
		});
	}
	return next({
		context: { ...context, user: context.user satisfies AuthedUser },
	});
});

export const authed = os.use(requireUser);
