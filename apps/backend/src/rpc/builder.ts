import { implement, ORPCError } from "@orpc/server";
import { contract } from "@roam/shared";
import type { AuthedUser, RpcContext } from "./context.js";

export const os = implement(contract).$context<RpcContext>();

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
