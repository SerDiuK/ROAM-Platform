import { os } from "./builder.js";
import { authRouter } from "./procedures/auth.js";
import { dispatchRouter } from "./procedures/dispatch.js";
import { eventsRouter } from "./procedures/events.js";
import { healthRouter } from "./procedures/health.js";
import { incidentsRouter } from "./procedures/incidents.js";
import { respondersRouter } from "./procedures/responders.js";
import { sessionAuthRouter } from "./procedures/sessionAuth.js";
import { vehiclesRouter } from "./procedures/vehicles.js";

export const rpcRouter = os.router({
	health: healthRouter,
	responders: respondersRouter,
	auth: { ...sessionAuthRouter, ...authRouter },
	vehicles: vehiclesRouter,
	incidents: incidentsRouter,
	dispatch: dispatchRouter,
	events: eventsRouter,
});
