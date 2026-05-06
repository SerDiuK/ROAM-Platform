# ROAM — Claude Code Session Tasks

Each section below is one Claude Code session. Copy-paste the prompt into Claude Code.
Run each session from the `roam-platform/` directory unless noted otherwise.
Complete the checklist at the end of each session before moving to the next.

---

## SESSION 1 — Monorepo scaffold + shared schemas

```
Set up the roam-platform Turborepo monorepo from scratch. Do all of the following:

1. Initialise pnpm workspace with Turborepo. Create root package.json with scripts:
   dev, build, typecheck, lint — all delegating to `turbo`. Create pnpm-workspace.yaml
   declaring apps/* and packages/*.

2. Create root tsconfig.json with: strict true, esModuleInterop true, skipLibCheck true,
   moduleResolution bundler, target ES2022.

3. Create turbo.json with a pipeline where build depends on ^build, dev is persistent,
   typecheck depends on ^typecheck.

4. Create packages/shared as a TypeScript package named @roam/shared. Install zod.
   Create src/schemas.ts with these Zod schemas — implement them fully, not as stubs:

   - CoordSchema: { lat: number, lon: number }
   - VehicleStatusSchema: z.enum(['available', 'in_use', 'locked', 'offline'])
   - VehicleSchema: _id string, make literal 'EZRaider', model literal 'HD4',
     status VehicleStatus, lastTelemetry optional TelemetrySchema, createdAt date
   - ResponderSchema: _id string, callsign string, nfcCardId optional string (stored hashed),
     pinHash optional string, role enum operator|dispatcher
   - TelemetrySchema: vehicleId string, lat number, lon number, speed number,
     heading number (0-360), batteryPct optional number, timestamp date
   - SessionSchema: _id string, vehicleId string, responderId string, startedAt date,
     endedAt optional date (null = active), durationSecs optional number,
     solanaTxSignature optional string, startCoords CoordSchema, endCoords optional CoordSchema
   - CheckinCredentialsSchema: discriminated union on 'type' field:
     { type: 'nfc', nfcToken: string } | { type: 'pin', pin: string }
   - CheckinRequestSchema: { vehicleId: string, credentials: CheckinCredentials }

   Export all schemas AND their inferred TypeScript types (e.g. `export type Vehicle = z.infer<typeof VehicleSchema>`).
   Export a `VEHICLE_STATUSES` const array.

5. Create packages/solana-client as a TypeScript package named @roam/solana-client.
   Install @coral-xyz/anchor @solana/web3.js bn.js @types/bn.js.
   Create src/index.ts with:
   - A placeholder IDL export (typed as `Idl` from anchor) with a comment saying
     "Replace with real IDL after anchor build in roam-contracts"
   - RecordSessionArgs type: { vehicleId: string, startedAt: BN, endedAt: BN, durationSecs: number }
   - getCluster(): reads SOLANA_CLUSTER env, returns 'devnet'|'mainnet-beta'|'localnet', defaults devnet
   - recordSessionOnChain(provider, args): derives session PDA, calls program.methods.recordSession,
     returns tx signature string. Has try/catch that wraps errors in a typed SolanaError class.
     Include a comment that the operator keypair is loaded from SOLANA_OPERATOR_KEYPAIR env as base58.

6. Create placeholder package.json files for the four apps (backend, dashboard, checkin, iot-bridge)
   with the correct @roam/* names and basic tsconfig.json files extending the root.

7. Run pnpm install from root. Run pnpm typecheck. Fix all type errors until it passes clean.

Success criteria: pnpm typecheck passes with zero errors. pnpm install completes without errors.
```

**Checklist before Session 2:**
- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes clean
- [ ] `packages/shared/src/schemas.ts` exports all schemas and types
- [ ] `packages/solana-client/src/index.ts` compiles

---

## SESSION 2 — Backend skeleton + MongoDB models

```
Build out apps/backend as a working Fastify server with MongoDB connection, all Mongoose models,
and a health endpoint. The server should start and accept requests.

Install these dependencies in apps/backend:
fastify @fastify/cors @fastify/websocket @fastify/type-provider-zod fastify-plugin
zod mongoose pino pino-pretty bcrypt @types/bcrypt crypto
@roam/shared

Dev dependencies: typescript tsx @types/node

Create this file structure:
apps/backend/src/
  index.ts       — entry point
  config.ts      — env var validation
  db/
    connection.ts
    models/
      vehicle.ts
      operator.ts
      session.ts
      telemetry.ts
  routes/
    health.ts

In config.ts, use Zod to parse and validate these env vars (throw on startup if invalid):
- PORT (default 3001, coerce to number)
- MONGODB_URL (required string)
- MQTT_PORT (default 1883, coerce to number)
- COT_PORT (default 8087, coerce to number)
- SOLANA_CLUSTER (default 'devnet')
- SOLANA_OPERATOR_KEYPAIR (optional string)
- NFC_PEPPER (required string)
- CHECKIN_ORIGIN (default 'http://localhost:3002')

In db/connection.ts, export a connectDb() function using mongoose.connect().
Log "MongoDB connected" on success, throw on error.

In db/models/vehicle.ts, create a Mongoose model matching VehicleSchema from @roam/shared.
Include lastTelemetry as an embedded subdocument. Add a compound index on { status: 1 }.

In db/models/session.ts, create a Mongoose model matching SessionSchema.
Add compound indexes: { vehicleId: 1, endedAt: 1 } and { startedAt: -1 }.

In db/models/telemetry.ts, create a Mongoose model matching TelemetrySchema.
Add indexes: { vehicleId: 1, timestamp: -1 } and { timestamp: 1 } with expireAfterSeconds: 604800.

In db/models/operator.ts, create a Mongoose model matching ResponderSchema.
Add unique index on callsign.

In routes/health.ts, register GET /health returning { status: 'ok', timestamp: ISO string }.

In index.ts, boot sequence:
1. Parse config
2. Connect MongoDB
3. Build Fastify with pino logger
4. Register @fastify/cors with origin from config
5. Register routes
6. Listen on configured PORT
7. Log "Server ready on port {PORT}" on start

Create apps/backend/.env.example:
PORT=3001
MONGODB_URL=mongodb://localhost:27017/roam
MQTT_PORT=1883
COT_PORT=8087
SOLANA_CLUSTER=devnet
SOLANA_OPERATOR_KEYPAIR=
NFC_PEPPER=change-this-in-production
CHECKIN_ORIGIN=http://localhost:3002

Add a dev script to package.json: "tsx watch src/index.ts"

Success criteria: SERVER STARTS. Run `pnpm --filter @roam/backend dev` with a real
MONGODB_URL set and confirm "Server ready" logs and GET /health returns 200.
```

**Checklist before Session 3:**
- [ ] Backend starts without errors
- [ ] `GET /health` returns 200
- [ ] All four Mongoose models compile and create their indexes on startup

---

## SESSION 3 — MQTT broker + telemetry pipeline

```
Add the Aedes MQTT broker and the full telemetry ingestion pipeline to apps/backend.
Telemetry arriving from the IoT bridge should flow through MQTT → MongoDB → WebSocket clients.

Install in apps/backend: aedes mqtt @types/aedes ws @types/ws

Create apps/backend/src/mqtt/broker.ts:
- Create an Aedes broker instance
- Create a net.Server wrapping the broker, listen on MQTT_PORT from config
- Export the broker instance
- Log each client connect/disconnect with callsign
- Export publishCommand(vehicleId: string, payload: object): void
  which publishes to vehicles/{vehicleId}/commands as JSON

Create apps/backend/src/mqtt/handlers.ts:
- Subscribe to vehicles/+/telemetry on the broker
- On each message:
  1. Parse JSON, validate with TelemetrySchema from @roam/shared (log and skip if invalid)
  2. Upsert to telemetry collection (insertOne)
  3. Update vehicle's lastTelemetry field (findByIdAndUpdate with upsert false)
  4. Broadcast to all WebSocket clients subscribed to /ws/telemetry (see below)
  5. Call publishCot() from the CoT publisher (stub this as a no-op for now — you'll implement CoT in Session 4)

Create apps/backend/src/ws/telemetryBroadcaster.ts:
- Maintain a Set<WebSocket> of connected clients
- Export addClient(ws), removeClient(ws), broadcast(data: object)
- broadcast() sends JSON.stringify(data) to all connected clients, removing dead connections

In apps/backend/src/index.ts, register a WebSocket route at /ws/telemetry using @fastify/websocket:
- On connection: add client to telemetryBroadcaster, remove on close
- No need to handle incoming messages from client

Wire everything together in index.ts startup sequence:
1. Parse config → connect MongoDB → start MQTT broker → register MQTT handlers → start HTTP server

Test the pipeline end-to-end:
1. Start the backend
2. Connect a MQTT client (use the `mqtt` CLI: `mqtt pub -t "vehicles/hd4-001/telemetry" -m '{"vehicleId":"hd4-001","lat":25.76,"lon":-80.19,"speed":12.5,"heading":180,"timestamp":"2026-05-05T10:00:00Z"}'`)
3. Verify the telemetry document is saved in MongoDB
4. Verify a WebSocket client at ws://localhost:3001/ws/telemetry receives the broadcast

Success criteria: Telemetry published to MQTT appears in MongoDB and is broadcast over WebSocket.
```

**Checklist before Session 4:**
- [ ] MQTT broker starts on port 1883
- [ ] Telemetry messages are stored in MongoDB
- [ ] WebSocket clients at /ws/telemetry receive broadcasts
- [ ] Malformed MQTT messages are logged and skipped without crashing

---

## SESSION 4 — CoT TCP publisher

```
Add the Cursor-on-Target (CoT) TCP server to apps/backend. This is how ATAK receives
live vehicle positions. CoT is a simple XML format — the backend emits one CoT event
per vehicle per telemetry update. ATAK clients connect to this TCP port and receive a
continuous stream of XML events.

Create apps/backend/src/cot/builder.ts:
Export buildCotEvent(params: { vehicleId: string, lat: number, lon: number,
  callsign: string, remarks: string, heading: number }): string

The function returns a valid CoT XML string:
<event version="2.0" uid="{vehicleId}" type="a-f-G-U-C"
       time="{now ISO}" start="{now ISO}" stale="{now + 90 seconds ISO}" how="m-g">
  <point lat="{lat}" lon="{lon}" hae="0" ce="10" le="10"/>
  <detail>
    <contact callsign="{callsign}"/>
    <track speed="{speed}" course="{heading}"/>
    <remarks>{remarks}</remarks>
  </detail>
</event>

Stale time should be 90 seconds from `now` — if ATAK doesn't receive a fresh update
within 90s the marker goes stale automatically. This is intentional.

Create apps/backend/src/cot/publisher.ts:
- Create a net.Server (raw TCP) listening on COT_PORT from config
- Maintain a Set of connected Socket clients
- Log each ATAK client connect/disconnect with their remote address
- Export publishCot(xml: string): void — writes xml + newline to all connected clients
  removing dead/closed sockets silently
- Handle socket errors (ECONNRESET etc) without crashing the server

Now wire CoT into the telemetry pipeline in apps/backend/src/mqtt/handlers.ts:
Replace the publishCot no-op stub. After saving telemetry, call:
publishCot(buildCotEvent({
  vehicleId,
  lat, lon, heading,
  callsign: vehicle.currentOperatorCallsign ?? vehicleId,
  remarks: `Speed: ${speed}km/h | Battery: ${battery ?? 'unknown'}`
}))

Add currentOperatorCallsign: string | null field to the Vehicle Mongoose model so
check-in/out can set it and the CoT stream reflects the active operator.

Start the CoT TCP server in index.ts alongside the other services.

Test with netcat:
  nc localhost 8087
Then publish a telemetry MQTT message — you should see CoT XML appear in the nc terminal.

Success criteria: CoT XML events stream to netcat on port 8087 whenever telemetry arrives.
```

**Checklist before Session 5:**
- [ ] TCP server starts on COT_PORT
- [ ] CoT XML events appear in netcat on telemetry arrival
- [ ] Stale time is 90s from event time
- [ ] TCP client disconnect is handled without crashing

---

## SESSION 5 — Auth routes (check-in / check-out)

```
Implement the check-in and check-out API routes in apps/backend. This is the core
business logic of ROAM — it enforces that only authenticated operators can claim a vehicle,
and that every completed session is committed to Solana.

Install in apps/backend: @coral-xyz/anchor @solana/web3.js bn.js
These are needed to call recordSessionOnChain from @roam/solana-client.

Create apps/backend/src/routes/auth.ts and register it on the Fastify instance.

POST /api/auth/checkin
Body: CheckinRequest from @roam/shared
Logic:
  1. Validate body with CheckinRequestSchema
  2. Find vehicle by vehicleId — return 404 if not found
  3. If vehicle.status !== 'available', return 409 { error: 'vehicle_not_available', status: vehicle.status }
  4. Authenticate operator:
     - If credentials.type === 'nfc':
         hash = sha256(credentials.nfcToken + config.NFC_PEPPER) using Node crypto
         find operator where nfcCardId === hash
         return 401 if not found
     - If credentials.type === 'pin':
         find operator by callsign in body (add callsign field to CheckinRequest for PIN path)
         compare credentials.pin with operator.pinHash using bcrypt.compare
         return 401 if no match
  5. Create session document: { vehicleId, responderId: operator._id, startedAt: new Date(), startCoords: last known coords from vehicle.lastTelemetry }
  6. Update vehicle: status → 'in_use', currentOperatorCallsign → operator.callsign
  7. Publish CoT update immediately (callsign + "ACTIVE" in remarks)
  8. Broadcast session event over /ws/sessions WebSocket (create the broadcaster, same pattern as telemetry)
  9. Return 200 { session, operator: { _id, callsign, role } }

POST /api/auth/checkout
Body: { sessionId: string }
Logic:
  1. Find session by ID — 404 if not found
  2. If session.endedAt is set, return 409 { error: 'session_already_ended' }
  3. Set endedAt = now, compute durationSecs
  4. Update vehicle: status → 'available', currentOperatorCallsign → null
  5. Save session
  6. Publish CoT update (vehicleId callsign, "AVAILABLE" remarks)
  7. Call recordSessionOnChain in a non-blocking try/catch (log errors, don't fail the response):
     - Load operator keypair from SOLANA_OPERATOR_KEYPAIR env
     - Call recordSessionOnChain with session data
     - If successful, update session.solanaTxSignature and save
  8. Broadcast session event over /ws/sessions
  9. Return 200 { session }

POST /api/responders/enrol
Body: { callsign: string, nfcToken: string, role?: 'operator'|'dispatcher' }
Logic:
  1. Hash nfcToken with NFC_PEPPER
  2. Upsert operator by callsign (create if not exists)
  3. Set nfcCardId to the hash
  4. Return 200 { operator }

Also add GET /api/vehicles, GET /api/vehicles/:id, GET /api/sessions, GET /api/sessions/active,
GET /api/sessions/:id as simple MongoDB queries with proper error handling.

Create apps/backend/src/ws/sessionBroadcaster.ts (same pattern as telemetryBroadcaster).
Register /ws/sessions WebSocket route in index.ts.

Success criteria: Using curl or a REST client:
- POST /api/responders/enrol with a fake NFC token creates an operator
- POST /api/auth/checkin with that NFC token starts a session and updates vehicle status
- POST /api/auth/checkout ends the session (Solana call will fail gracefully without a real keypair)
- GET /api/sessions/active returns the session while active, empty after checkout
```

**Checklist before Session 6:**
- [ ] Checkin creates session + sets vehicle to in_use
- [ ] Checkout ends session + sets vehicle to available
- [ ] Solana failure does not break checkout (non-blocking)
- [ ] /ws/sessions broadcasts checkin/checkout events
- [ ] Invalid NFC token returns 401, not 500

---

## SESSION 6 — IoT bridge (GPS simulator + real serial)

```
Build apps/iot-bridge — the Node.js process that runs on the Raspberry Pi and
publishes GPS telemetry to the backend MQTT broker.

Install: serialport @serialport/parser-readline mqtt pino
Dev: typescript tsx @types/node

Create apps/iot-bridge/src/config.ts — validate these env vars:
- MQTT_URL (required, e.g. mqtt://localhost:1883)
- VEHICLE_ID (required, e.g. "hd4-001")
- SERIAL_PORT (default /dev/ttyUSB1)
- BAUD_RATE (default 115200, coerce number)
- SIMULATE (default false, coerce boolean)
- SIMULATE_LAT (default 25.7617, coerce number) — Miami
- SIMULATE_LON (default -80.1918, coerce number)
- ROUTE_FILE (optional string, path to a route JSON file — overrides random-walk when set)

Create apps/iot-bridge/src/nmea.ts:
Parse $GPRMC sentences (they contain lat, lon, speed, heading, timestamp).
Export interface GpsFix { lat: number, lon: number, speed: number, heading: number, timestamp: number }
Export parseNmea(line: string): GpsFix | null
- Return null for non-$GPRMC lines, void fixes (status 'V'), and parse errors
- Convert speed from knots to km/h (multiply by 1.852)
- Convert NMEA lat/lon format (DDMM.MMMM) to decimal degrees

Create apps/iot-bridge/src/simulator.ts:
Export startSimulator(vehicleId: string, onFix: (fix: GpsFix) => void): void
Two modes depending on whether ROUTE_FILE is set:

Route-file mode (ROUTE_FILE is set):
- Load the JSON file — array of waypoints: { lat, lon, holdMs }
- Interpolate linearly between consecutive waypoints, emitting a fix every 1000ms
- Dwell at each waypoint for holdMs before advancing to the next
- Compute speed from distance/time between interpolated points, heading from bearing
- Loop back to the first waypoint after reaching the last
- Deterministic and repeatable — ideal for demos and testing

Random-walk mode (ROUTE_FILE not set, fallback):
- Emits a fake GpsFix every 2 seconds
- Position drifts slightly each tick (±0.0001 degrees random walk) from SIMULATE_LAT/LON
- Speed oscillates between 5–35 km/h
- Heading changes slowly (±5 degrees per tick)

Both modes log "[VEHICLE_ID] SIM fix: lat={lat} lon={lon} @ {speed}km/h" each emission

Create apps/iot-bridge/routes/ directory with these route files for Miami (Consensus venue area,
roughly 25.76–25.78 lat, -80.19– -80.18 lon). Each file is a JSON array of waypoints:
  { "lat": number, "lon": number, "holdMs": number }

- patrol_alpha.json — clockwise patrol loop around the venue (6–8 waypoints, holdMs 1500–2500)
- patrol_bravo.json — different patrol loop, slightly offset from alpha
- convoy.json — straight-line route simulating a vehicle convoy between two points

Create apps/iot-bridge/src/gps.ts:
Export startGps(onFix: (fix: GpsFix) => void): void
- Opens SerialPort on SERIAL_PORT at BAUD_RATE
- Pipes through ReadlineParser
- On each line, calls parseNmea — if valid fix, calls onFix
- Logs serial port errors without crashing (retry connection after 5s on error)

Create apps/iot-bridge/src/index.ts:
1. Parse config
2. Connect to MQTT broker (mqtt.connect with reconnectPeriod: 3000)
3. On MQTT connect, log "MQTT connected"
4. Start simulator (if SIMULATE=true) or startGps (if SIMULATE=false)
5. On each GpsFix, publish to vehicles/{VEHICLE_ID}/telemetry:
   { vehicleId, lat, lon, speed, heading, timestamp: fix.timestamp, batteryPct: null }
6. Log each publish: "Published fix: {lat},{lon} @ {speed}km/h"

Create apps/iot-bridge/ecosystem.config.cjs for PM2:
module.exports = { apps: [{ name: 'iot-bridge', script: 'dist/index.js',
  restart_delay: 3000, max_restarts: 10 }] }

Create apps/iot-bridge/.env.example:
MQTT_URL=mqtt://your-backend:1883
VEHICLE_ID=hd4-001
SERIAL_PORT=/dev/ttyUSB1
BAUD_RATE=115200
SIMULATE=true

Add dev script: "SIMULATE=true tsx src/index.ts"

Success criteria: Run `pnpm --filter @roam/iot-bridge dev` with backend running.
GPS fixes should appear in MongoDB telemetry collection every 2 seconds.
The backend WebSocket /ws/telemetry should broadcast each fix.
```

**Checklist before Session 6b:**
- [ ] Simulator emits fixes every 2 seconds (random-walk mode)
- [ ] Route-file mode follows waypoints with interpolation and holdMs dwell
- [ ] Route files exist in apps/iot-bridge/routes/ (patrol_alpha, patrol_bravo, convoy)
- [ ] Fixes arrive in MongoDB telemetry collection
- [ ] Backend broadcasts over /ws/telemetry
- [ ] NMEA parser handles malformed lines without crashing

---

## SESSION 6b — Fleet simulator orchestrator

```
Create apps/sim-fleet — a thin orchestrator that spawns multiple IoT bridge instances
as child processes, each simulating a different vehicle on a different route. This gives
you a one-command multi-vehicle fleet for dashboard testing and hackathon demos.

Install: pino @roam/shared
Dev: typescript tsx @types/node

Create apps/sim-fleet/package.json with name @roam/sim-fleet.

Create apps/sim-fleet/src/config.ts — validate these env vars:
- MQTT_URL (required, default mqtt://localhost:1883)
- BACKEND_URL (optional, default http://localhost:3001 — used for auto-checkin)
- FLEET_CONFIG (optional, path to a fleet JSON file — defaults to built-in 3-vehicle fleet)

Create apps/sim-fleet/src/fleet.ts:
Define a FleetVehicle type: { vehicleId, routeFile, responderId?, autoCheckin? }
Default fleet (used when FLEET_CONFIG is not set):
  [
    { vehicleId: "ALPHA-01", routeFile: "patrol_alpha.json", autoCheckin: true },
    { vehicleId: "BRAVO-01", routeFile: "patrol_bravo.json", autoCheckin: true },
    { vehicleId: "CONVOY-01", routeFile: "convoy.json", autoCheckin: true }
  ]
If FLEET_CONFIG is set, load and validate the JSON file instead.

Create apps/sim-fleet/src/index.ts:
1. Parse config, load fleet definition
2. For each vehicle in the fleet, spawn a child process running the IoT bridge:
   - Use child_process.fork() or spawn() pointing at apps/iot-bridge/src/index.ts
   - Pass env vars: VEHICLE_ID, ROUTE_FILE (resolved to absolute path in apps/iot-bridge/routes/),
     MQTT_URL, SIMULATE=true
   - Prefix all child stdout/stderr with [VEHICLE_ID] for readable logs
3. If autoCheckin is true for a vehicle, wait 3 seconds after spawn then call
   POST {BACKEND_URL}/api/auth/checkin with a default operator (requires seeded data — see below)
4. Handle SIGINT/SIGTERM: kill all child processes gracefully
5. Log fleet status on startup: "Fleet started: N vehicles"

Create apps/sim-fleet/src/seed.ts:
Export seedFleet(backendUrl: string, fleet: FleetVehicle[]): Promise<void>
- For each vehicle: PUT or POST to create the vehicle in the backend if it doesn't exist
- Create a default operator "SIM-OPERATOR" via POST /api/responders/enrol if not already enrolled
- This ensures the auto-checkin calls have valid vehicle and operator records
- Run automatically on startup before spawning child processes

Add dev script: "tsx src/index.ts"
Add to apps/sim-fleet/.env.example:
MQTT_URL=mqtt://localhost:1883
BACKEND_URL=http://localhost:3001

Usage:
  pnpm --filter @roam/sim-fleet dev     # starts 3-vehicle fleet with auto-checkin

Success criteria: Run the backend, then run sim-fleet. Three vehicles appear on the dashboard
map following their respective routes. All three have active sessions. Stopping sim-fleet
with Ctrl+C kills all child processes cleanly.
```

**Checklist before Session 7:**
- [ ] sim-fleet spawns 3 IoT bridge child processes
- [ ] Each vehicle follows its route file on the dashboard map
- [ ] Auto-checkin creates sessions for all vehicles
- [ ] Ctrl+C cleanly stops all processes
- [ ] Logs are prefixed with vehicle ID and readable in a single terminal

---

## SESSION 7 — Dispatcher dashboard (live map)

```
Build the dispatcher dashboard in apps/dashboard. This is the full-screen Next.js app
that dispatchers use to watch vehicle positions, manage geofences, and review sessions.

Install: react-leaflet leaflet @types/leaflet @roam/shared

The critical constraint: Leaflet requires the browser DOM. All map components must use
dynamic imports with ssr: false.

Create apps/dashboard/src/hooks/useTelemetrySocket.ts:
- Connects to NEXT_PUBLIC_WS_URL/ws/telemetry using the browser WebSocket API
- Maintains state: Map<string, TelemetrySchema> keyed by vehicleId
- Updates the map on each incoming message
- Reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s) on disconnect
- Returns { positions, connected: boolean }

Create apps/dashboard/src/hooks/useSessionSocket.ts:
- Same pattern but connects to /ws/sessions
- Maintains a recent sessions array (last 20 events)
- Returns { recentEvents, connected: boolean }

Create apps/dashboard/src/components/LiveMap.tsx:
- Dynamic import of a MapInner component with { ssr: false }
- MapInner: renders react-leaflet MapContainer with OpenStreetMap tiles
  (URL: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png)
- Accepts vehicles: Vehicle[] and positions: Map<string, Telemetry>
- For each vehicle, renders a Marker at its last known position
- Marker colour based on status:
    available → green circle icon
    in_use → amber circle icon  
    locked → red circle icon
    offline → grey circle icon
  Implement with simple DivIcon using inline CSS
- Marker popup shows: callsign, status, speed, last update time, battery
- Default center: Miami (25.7617, -80.1918), zoom 13

Create apps/dashboard/app/page.tsx:
- Full-screen layout: LiveMap fills the viewport
- Floating panel (top-right): connection status dot + vehicle count
- Floating panel (bottom-left): last 5 session events from useSessionSocket

Create apps/dashboard/app/sessions/page.tsx:
- Table of all sessions fetched from GET /api/sessions
- Columns: vehicle, operator, started, ended, duration, Solana link
- Solana link: https://explorer.solana.com/tx/{signature}?cluster=devnet (or mainnet-beta)
  Show as "View on Explorer" — grey/disabled if no signature yet
- Paginated (20 per page)

Create apps/dashboard/lib/api.ts:
Typed fetch wrappers for all backend endpoints:
- getVehicles(): Promise<Vehicle[]>
- getSessions(page: number): Promise<Session[]>
- lockVehicle(vehicleId: string): Promise<void>
- unlockVehicle(vehicleId: string): Promise<void>
All functions read NEXT_PUBLIC_BACKEND_URL from env.

Create apps/dashboard/.env.example:
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

Success criteria: Dashboard loads, map renders (centred on Miami), live vehicle markers
appear and move when the IoT bridge simulator is running. Session table loads at /sessions.
```

**Checklist before Session 8:**
- [ ] Map renders without SSR errors
- [ ] Vehicle markers appear when simulator is running
- [ ] Markers update position in real time
- [ ] Status colours are correct
- [ ] Session table renders at /sessions with Solana Explorer links

---

## SESSION 8 — Solana integration (real devnet)

```
Wire up the real Solana integration. Until now, the Solana call in checkout has been
a no-op (no keypair set). This session makes it real on devnet.

Prerequisites (do these manually before running this session):
1. Install Solana CLI: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
2. Generate a keypair: solana-keygen new --outfile ~/.config/solana/roam-operator.json
3. Airdrop devnet SOL: solana airdrop 2 --keypair ~/.config/solana/roam-operator.json --url devnet
4. Confirm balance: solana balance --keypair ~/.config/solana/roam-operator.json --url devnet

Prerequisites (do these manually, require Rust + Anchor CLI):
5. Install Rust: curl https://sh.rustup.rs -sSf | sh
6. Install Anchor: cargo install --git https://github.com/coral-xyz/anchor anchor-cli
7. cd ../roam-contracts && anchor build
8. anchor deploy --provider.cluster devnet
9. Copy target/idl/roam.json to ../roam-platform/packages/solana-client/src/idl.json
10. Note the deployed program ID from the deploy output

Now implement the following (in this Claude Code session):

In packages/solana-client/src/index.ts:
- Replace the placeholder IDL with the real IDL imported from ./idl.json
  (TypeScript: `import idl from './idl.json' assert { type: 'json' }`)
- Update the declared program ID to match the deployed program ID from step 10
- Implement recordSessionOnChain fully:
  1. Load operator keypair from SOLANA_OPERATOR_KEYPAIR env (base58-encoded private key)
     Convert with: Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_OPERATOR_KEYPAIR))
     Install bs58 in packages/solana-client
  2. Create Connection to cluster URL
  3. Create AnchorProvider with the keypair as wallet
  4. Derive PDA seeds: ["session", operatorPubkey, vehicleId bytes, startedAt as 8-byte LE buffer]
  5. Call program.methods.recordSession(args).accounts({ session: pda, operator: keypair.publicKey }).rpc()
  6. Return the transaction signature
  7. On error: log the error, throw a typed SolanaError

In apps/backend/src/routes/auth.ts, the checkout route currently calls recordSessionOnChain
in a non-blocking try/catch. Verify this is correct — on Solana success, update
session.solanaTxSignature and save. On failure, log and continue. The checkout HTTP response
must not wait for Solana confirmation (fire and forget with a timeout of 15s max).

Add a SOLANA_OPERATOR_KEYPAIR to apps/backend/.env.example with instructions:
# Base58-encoded private key from: cat ~/.config/solana/roam-operator.json | python3 -c "import sys,json,base58; print(base58.b58encode(bytes(json.load(sys.stdin))).decode())"
# Or use: solana-keygen show --outfile ~/.config/solana/roam-operator.json

Test end-to-end:
1. Set SOLANA_OPERATOR_KEYPAIR in apps/backend/.env.local
2. Start backend
3. Enrol an operator, check in, check out
4. The session in MongoDB should have a solanaTxSignature
5. Open https://explorer.solana.com/tx/{signature}?cluster=devnet — should show confirmed
6. The dashboard sessions table should show "View on Explorer" as a working link

Success criteria: A completed session shows a real Solana Explorer link that resolves
to a confirmed transaction on devnet.
```

**Checklist before Session 9:**
- [ ] recordSessionOnChain sends a real transaction to devnet
- [ ] Completed sessions have solanaTxSignature in MongoDB
- [ ] Solana Explorer link works for completed sessions
- [ ] Checkout does not hang if Solana is slow (15s timeout)

---

## SESSION 9 — roam-atak Android plugin (native Kotlin hello world)

> **Run this session from the `roam-atak/` directory, not roam-platform.**
> Android Studio must be installed and ATAK-CIV SDK downloaded from tak.gov.
> The HelloWorld plugin from the SDK must already sideload successfully (manual prerequisite).

```
Build the ROAM ATAK plugin as a native Kotlin dropdown. This is a minimal "hello world"
that proves the plugin loads, registers a toolbar button, and opens a dropdown pane
with native Android UI. No WebView, no PWA dependency — future sessions will add
check-in UI natively in Kotlin.

The project uses the plugintemplate from the ATAK SDK as its starting point.
Assume the template has been copied and the package renamed to com.roam.atak.

Implement the following files:

1. app/src/main/java/com/roam/atak/RoamDropDownReceiver.kt

The core of the plugin. Opens a dropdown pane with a simple native layout:
a "ROAM" title, a subtitle showing plugin version, and a placeholder message.

- Extend DropDownReceiver
- In onReceive, inflate the native layout and call showDropDown
- Use HALF_WIDTH/FULL_HEIGHT portrait, FULL_WIDTH/HALF_HEIGHT landscape
- The layout is a simple LinearLayout with:
  - "ROAM" title (large, bold, white text)
  - "v1.0.0-hackathon" subtitle (smaller, grey)
  - "Hello from ROAM" message (centred, medium text)
  - A dark background (#1a1a2e) to match the tactical aesthetic
- Build the layout programmatically (no XML layout file needed for this minimal version)

2. app/src/main/java/com/roam/atak/RoamLifecycle.kt

Registers the plugin and creates the toolbar button:
- Extend DropDownMapComponent
- In onCreate: create the RoamDropDownReceiver, register it with a DocumentedIntentFilter
  for the SHOW_PLUGIN action
- Register a toolbar button that broadcasts the SHOW_PLUGIN intent when tapped

3. app/src/main/java/com/roam/atak/RoamPlugin.kt

Object holding plugin constants:
- PLUGIN_VERSION = "1.0.0-hackathon"

4. Update AndroidManifest.xml to:
- Add uses-permission android.permission.INTERNET
- Declare the plugin lifecycle class in the atakmap plugin meta-data
- Set minSdkVersion 26 (Android 8), targetSdkVersion 34

5. Create res/drawable/ic_roam_tool.xml — a simple vector drawable for the toolbar icon
   (a circle with a dot in the centre, representing a map pin/vehicle marker)

6. app/build.gradle:
- Add to defaultConfig: manifestPlaceholders = [atakApiVersion: "1.0.0.0"]
- Ensure Gradle and AGP versions match ATAK SDK requirements (check SDK README)

7. Create local.properties.template with comments:
# Copy to local.properties (this file is gitignored)
sdk.dir=/Users/your-name/Library/Android/sdk
takDebugKeyFile=/path/to/roam-atak/debug.keystore
takDebugKeyFilePassword=android
takDebugKeyAlias=androiddebugkey
takDebugKeyPassword=android

After creating all files: build the APK in Android Studio (Build → Build APK).
Sideload to device and confirm:
- Plugin appears in ATAK plugin manager
- Enable it — ROAM button appears in toolbar
- Tapping the button opens a side panel with the "Hello from ROAM" native layout

Note any Gradle/SDK version issues and fix them — ATAK SDK version compatibility
with the Gradle version is the most common problem. The SDK zip README states the
required Gradle and AGP versions.

Success criteria: ROAM button in ATAK toolbar → tap → native "Hello from ROAM"
dropdown panel opens without crashing.
```

**Checklist before Session 10:**
- [ ] Plugin APK builds without errors
- [ ] Plugin loads in ATAK without crashing
- [ ] Toolbar button appears and is tappable
- [ ] Dropdown opens with native "Hello from ROAM" layout

---

## SESSION 10 — Demo hardening + reliability

```
The core flow works: vehicles move on the dashboard, Solana records sessions, ATAK
receives CoT markers, and the ATAK plugin loads. Now make it reliable enough to demo
live without babysitting. Every reconnect path, every error state, and every fallback
needs to work gracefully.

BACKEND
1. Add Fastify error handler (setErrorHandler) that returns JSON errors consistently,
   never leaking stack traces in production.
2. Add request logging with pino — log method, url, statusCode, responseTime for every request.
3. MQTT broker: if a client sends malformed JSON on the telemetry topic, log the raw
   message and skip it — never crash the handler.
4. CoT publisher: wrap all socket writes in try/catch, remove dead sockets silently.
   Add a 30-second heartbeat that publishes a CoT event for each vehicle with a known
   last position — prevents ATAK markers from going stale if telemetry pauses briefly.
5. Add GET /api/status returning: { mongodb: 'connected'|'disconnected', mqtt: { clients: number },
   cot: { clients: number }, uptime: seconds }. This is useful for the demo.

IOT BRIDGE
6. MQTT reconnect: the mqtt client should have reconnectPeriod: 3000 and keepalive: 60.
   Log "MQTT reconnected" on successful reconnect.
7. If SIMULATE=true and the backend is unreachable on startup, retry MQTT connection
   indefinitely — do not crash.
8. Add a startup log banner showing: VEHICLE_ID, SIMULATE mode, MQTT_URL, current timestamp.

DASHBOARD
9. useTelemetrySocket: show a "Reconnecting..." badge when the WebSocket is down.
   Reconnect with backoff — do not attempt faster than once per second.
10. useTelemetrySocket: if a vehicle's last update was more than 30 seconds ago, mark
    it as 'offline' in the UI regardless of its stored status.
11. Add a connection status bar at the top of the map page:
    Green dot "Live" when WebSocket connected, red dot "Reconnecting..." when not.

Run through the demo scenario manually and log any rough edges:
- Simulator running → vehicle moving on dashboard map
- Check in via curl/API → session starts, dashboard shows operator on vehicle
- Check out → session ends, Solana tx visible in dashboard
- Open ATAK → CoT markers visible and updating
- Open ATAK ROAM plugin → hello world panel opens

Fix any issues found during the walkthrough.

Success criteria: Core demo flow runs without errors. Stopping and restarting the
IoT bridge reconnects automatically. Closing and reopening the dashboard reconnects
automatically. CoT markers stay live in ATAK throughout.
```

**Checklist before Session 11:**
- [ ] GET /api/status returns healthy
- [ ] IoT bridge auto-reconnects after restart
- [ ] Dashboard WebSocket reconnects with status indicator
- [ ] Core demo flow runs clean end-to-end

---

## SESSION 11 — Checkin PWA (NFC + PIN flow) [deprioritized]

> **Not on the critical path for hackathon demo.** Build this if time allows after
> Sessions 8–10 are solid. Check-in can be done via curl/API for the demo if needed.

```
Build apps/checkin — the mobile-first PWA that operators use to check in and out.
This is a standalone web app (not loaded inside ATAK — the ATAK plugin is native Kotlin).

Install: @roam/shared

Create apps/checkin/src/lib/nfc.ts:
export async function readNfcCard(): Promise<string>:
- Check if 'NDEFReader' in window — throw Error('nfc_not_supported') if not
- Create NDEFReader, call scan()
- Return a Promise that resolves with event.serialNumber on first successful read
- Reject with typed error on NDEFReader error event
- Timeout after 30 seconds (throw Error('nfc_timeout'))

export function isNfcSupported(): boolean:
- Returns 'NDEFReader' in window

Create apps/checkin/src/lib/api.ts:
Typed wrappers reading NEXT_PUBLIC_BACKEND_URL:
- checkin(vehicleId: string, credentials: CheckinCredentials): Promise<{ session, operator }>
- checkout(sessionId: string): Promise<{ session }>
- enrolCard(callsign: string, nfcToken: string): Promise<{ operator }>
- getVehicles(): Promise<Vehicle[]>

Create apps/checkin/app/layout.tsx:
- viewport: width=device-width, initial-scale=1, maximum-scale=1 (prevent zoom on input focus)
- theme-color meta: #000000
- Link to /manifest.json
- Full-height body (min-height: 100dvh)

Create apps/checkin/public/manifest.json:
{
  "name": "ROAM Check-in",
  "short_name": "ROAM",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "start_url": "/",
  "icons": [{ "src": "/icon.png", "sizes": "192x192", "type": "image/png" }]
}

Create apps/checkin/app/page.tsx — vehicle selector:
- Fetches GET /api/vehicles on load
- Renders a list of vehicles with status badges
- Tapping a vehicle navigates to /checkin/[vehicleId]
- If only one vehicle (demo scenario), auto-redirect to its checkin page

Create apps/checkin/app/checkin/[vehicleId]/page.tsx — the main operator flow:

State machine: idle → nfc_scanning → pin_entry → submitting → active_session | error

Layout: full-screen dark background, centred content, large touch targets (min 48px height)

Idle state:
- Vehicle name + current status
- If isNfcSupported(): show large "TAP CARD" button with an animated ring (CSS pulse)
- Always show "Use PIN instead" text button below
- If vehicle.status !== 'available': show status message, disable tap

NFC scanning state (after tapping the button):
- Calls readNfcCard()
- Shows "Hold card to phone..." with spinner
- On success → call checkin(vehicleId, { type: 'nfc', nfcToken: uid }) → active session
- On nfc_not_supported or nfc_timeout → fall back to pin_entry state
- Show cancel button

PIN entry state:
- Callsign text input
- 4-digit PIN input (type="password", inputmode="numeric")
- Submit button
- On submit → call checkin(vehicleId, { type: 'pin', pin, callsign }) → active session

Active session state (also the /active page for returning operators):
- Show: vehicle name, operator callsign, elapsed time (live counter, updates every second)
- Large "CHECK OUT" button
- On check out → call checkout(sessionId) → back to idle
- If session has solanaTxSignature, show "Verified on Solana" badge with explorer link

Error state:
- Show error message
- Retry button returns to idle

Create apps/checkin/app/enrol/page.tsx — NFC card enrolment:
- Callsign input
- "TAP CARD TO ENROL" button
- Calls readNfcCard() then enrolCard(callsign, uid)
- Success: "Card registered for {callsign}"
- This page is for dispatchers only — no auth guard needed for hackathon

Hardening (include in this session since demo hardening was done earlier):
- If the backend is unreachable when checkout is attempted, show a "Retry" button
- Store the active sessionId in localStorage so refreshing the page returns to the
  active session view rather than the vehicle selector
- Add a minimal error boundary at the app root

Create apps/checkin/.env.example:
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

Success criteria: Load the app in Chrome (desktop). Vehicle list appears. Navigate to a
vehicle's checkin page. PIN flow completes and creates a session. Active session shows
elapsed timer. Checkout ends the session.
NFC flow: Load on Android Chrome. Tap card button. Physical NFC card tap is read.
```

**Checklist before Session 12:**
- [ ] Vehicle list loads from API
- [ ] PIN flow creates a session end-to-end
- [ ] Active session shows live elapsed timer
- [ ] Checkout returns to idle state
- [ ] NFC button gracefully degrades on desktop (falls back to PIN)
- [ ] App renders well on a 390px wide mobile viewport

---

## SESSION 12 — Geofences + vehicle commands [deprioritized]

> **Not on the critical path for hackathon demo.** Build this if time allows.

```
Add geofence management and vehicle lock/unlock commands to the backend and dashboard.

BACKEND CHANGES

Create apps/backend/src/db/models/geofence.ts:
Mongoose model for Geofence:
- _id: string
- name: string
- vehicleIds: string[] (which vehicles this fence applies to — empty = all)
- polygon: CoordSchema[] (array of lat/lon points forming a closed polygon)
- createdAt: date

Export a pointInPolygon(point: Coord, polygon: Coord[]): boolean function
using the ray-casting algorithm. This is pure geometry — no external library needed.
Implement it directly: cast a ray from the point in the +x direction and count how
many times it crosses the polygon boundary. Odd = inside, even = outside.

In apps/backend/src/mqtt/handlers.ts, after saving telemetry:
- Load all geofences that apply to this vehicleId
- For each geofence, check if the current position is inside using pointInPolygon
- If a vehicle was inside last tick and is now outside (or vice versa), emit a breach event:
  - Broadcast over /ws/sessions with type: 'geofence_breach', { vehicleId, geofenceName, direction: 'entered'|'exited', coords }
  - Log the breach with pino

To track last-known geofence state, maintain a Map<vehicleId, Set<geofenceId>> in memory
(geofences the vehicle was inside on the previous telemetry tick).

Add routes to apps/backend/src/routes/geofences.ts:
- GET /api/geofences — list all
- POST /api/geofences — create, body: { name, polygon: CoordSchema[], vehicleIds? }
- DELETE /api/geofences/:id — delete
Register this route file in index.ts.

Add to apps/backend/src/routes/vehicles.ts:
- POST /api/vehicles/:id/lock — set vehicle status to 'locked', publishCommand(vehicleId, { command: 'lock' })
- POST /api/vehicles/:id/unlock — set vehicle status to 'available', publishCommand(vehicleId, { command: 'unlock' })
Both are dispatcher-only actions (add role check: read operator role from a bearer token header — for
hackathon, accept a simple static token from config env var COMMANDER_TOKEN, validate it matches).

IOT BRIDGE CHANGES

In apps/iot-bridge/src/commands.ts:
- Subscribe to vehicles/{VEHICLE_ID}/commands after MQTT connect
- On message: parse JSON, log the command type
- For 'lock': log "LOCK COMMAND RECEIVED — vehicle should be immobilised"
  (actual GPIO relay is post-hackathon — log is sufficient for demo)
- For 'unlock': log "UNLOCK COMMAND RECEIVED"
Wire this into apps/iot-bridge/src/index.ts startup.

DASHBOARD CHANGES

In apps/dashboard/src/components/LiveMap.tsx, add geofence polygon rendering:
- Fetch GET /api/geofences on load, refetch every 30s
- Render each geofence as a react-leaflet Polygon with a semi-transparent fill
- Different colour per geofence (cycle through a palette)

Add a GeofencePanel component to the dashboard:
- Floating panel listing all geofences by name
- Each has a delete button (calls DELETE /api/geofences/:id)
- "Draw new geofence" button — for hackathon, open a simple form that accepts
  a JSON array of coordinates (dispatchers will paste coords, not draw on map)
  Post-hackathon: integrate Leaflet.draw

Add lock/unlock buttons to each vehicle marker popup.

Success criteria:
- Create a geofence via POST /api/geofences with a polygon around Miami
- Start the simulator
- When the simulated vehicle enters/exits the polygon, breach events appear in the dashboard
- Lock/unlock buttons in the dashboard publish MQTT commands that appear in iot-bridge logs
```

**Checklist before Session 13:**
- [ ] Geofences are stored and returned by API
- [ ] pointInPolygon works correctly (test with a known point inside a simple square)
- [ ] Breach events broadcast over WebSocket when vehicle crosses boundary
- [ ] Geofence polygons render on dashboard map
- [ ] Lock command published to MQTT and logged in IoT bridge

---

## SESSION 13 — Demo prep + final integration test

```
Final session before the hackathon. Run the complete demo scenario and fix anything
that breaks. Do not add features — only fix reliability and polish.

Run through this exact scenario in order, fixing each issue as it appears:

SETUP (do this manually before the session):
- Backend deployed to Railway with real env vars
- Dashboard deployed to Vercel at dashboard.roam.app (or similar)
- IoT bridge running on Raspberry Pi with real SIM7600G-H GPS (or simulator)
- ATAK-CIV installed on Android device, CoT network configured to Railway backend IP:8087
- ROAM plugin sideloaded and enabled on the Android device

DEMO SCENARIO (core — must work):
1. Open dashboard on a laptop — map loads, vehicle marker is moving (GPS from Pi)
2. Open ATAK on Android — vehicle marker appears on tactical map, moving in sync
3. Tap ROAM button in ATAK — native "Hello from ROAM" panel opens (proves plugin works)
4. Check in via API/curl — session starts
5. Dashboard updates: vehicle status → in_use, operator callsign on marker
6. Check out via API/curl — session ends
7. Dashboard: vehicle back to available, session in table with Solana Explorer link
8. Open Solana Explorer link — transaction confirms on devnet

DEMO SCENARIO (if PWA is built — Session 11):
9. Open checkin PWA on phone browser
10. Tap NFC card — operator authenticated, session starts
11. Tap "Check out" — session ends with Solana verification

DEMO SCENARIO (if geofences are built — Session 12):
12. Simulate geofence breach → dashboard shows alert
13. Dispatcher clicks Lock on dashboard → MQTT command logged in IoT bridge

For each step that fails, fix it before continuing.

After the core flow works:
- Update the CLAUDE.md "Current focus" line to: "Demo ready — May 5 2026 Miami"
- Commit everything with message "chore: demo-ready build"
- Tag the commit: git tag v1.0.0-hackathon

Additional hardening if time allows:
- Add a /demo-reset API endpoint (authenticated with COMMANDER_TOKEN) that sets all
  vehicles back to 'available' and clears active sessions — useful for resetting
  between judge demos without restarting the server
- Create a simple demo script document (bullet points, 2 minutes) for the presentation

Success criteria: Core demo steps (1–8) complete without errors or manual intervention.
The demo can be run twice in a row with no state issues.
```

---

## Ongoing: CLAUDE.md maintenance

After each session, update the "Current focus" line in CLAUDE.md to reflect what's next.
As you complete features, add any new gotchas, conventions, or architectural notes
that would be useful context for future sessions. Keep it under 100 lines — if it grows
beyond that, move detail into subdirectory CLAUDE.md files per app.

---

# PART 2 — Agentic Dispatch Build Plan

The agentic-dispatch feature: emergency call transcription → AI-drafted mission briefing
→ human (or auto) confirmation → push fan-out to operators → first-to-accept claim →
USDC payout via custodial wallets behind a swappable WalletProvider abstraction
(embedded Solana on devnet today — see AD-2 pivot note; Crossmint or similar
for mainnet operator UX later), with every step recorded on Solana.

Stack diagram: `stack-flow.svg`

Schemas: already added in `packages/shared/src/schemas.ts` (Incident, Briefing, Dispatch,
DispatchResponse, Payout, plus extensions to Operator and Vehicle). Run `pnpm typecheck`
before starting AD-1 to confirm clean baseline.

**Conventions for AD sessions** (smaller scope = better results):
- One session per file in this list. Land it, type-check, smoke-test, commit, move on.
- Each session has explicit **In scope** and **Out of scope** so the diff stays small.
- Each session has an **Acceptance** check — the cheapest way to prove it works.
- If a session feels too big mid-flight, split it. Don't merge a half-done session.

---

## AD-1 — Persistence models + indexes

```
Add Mongoose models for the new agentic-dispatch entities, plus extensions on the
existing Operator and Vehicle models. The Zod source-of-truth schemas are already in
packages/shared/src/schemas.ts.

Files to create in apps/backend/src/db/models/:
- incident.ts (matches IncidentSchema; index on { status: 1, callStartedAt: -1 })
- briefing.ts (matches BriefingSchema; index on { incidentId: 1 })
- dispatch.ts (matches DispatchSchema; index on { status: 1, expiresAt: 1 })
- dispatchResponse.ts (matches DispatchResponseSchema; unique compound on
  { dispatchId: 1, responderId: 1 } — first-to-claim relies on this)
- payout.ts (matches PayoutSchema; index on { status: 1, dispatchId: 1 })

Files to extend (additive, no migration):
- vehicle.ts: add assignedResponderIds: string[]; add a 2dsphere index — easiest path
  is to derive a GeoJSON `lastTelemetry.location` Point on save, index that.
- operator.ts: add capabilities, pushTokens, walletAddress; sparse index on
  capabilities; index on walletAddress. (encryptedWalletSecret was added in
  AD-2 for the custodial provider — `select:false` so it never leaks.)

Each model must round-trip through its Zod schema. Add scripts/smoke-models.ts that
creates one of each new entity, reads it back, calls Zod parse, prints OK or FAIL.

Out of scope: any procedures, any business logic. Only models + indexes.

Acceptance:
- pnpm --filter @roam/backend typecheck passes
- pnpm tsx scripts/smoke-models.ts prints OK for all 5 new + 2 extended models
- mongosh shows the 2dsphere index on vehicles
```

**Checklist before AD-2:**
- [ ] All 5 new models compile and create their indexes
- [ ] Operator + Vehicle extensions don't break existing checkin
- [ ] 2dsphere index built on vehicle.lastTelemetry.location
- [ ] Smoke script passes round-trip for each model

---

## AD-2 — Wallet abstraction (embedded Solana; pivoted from Crossmint)

> **Pivot note (2026-05-03):** Crossmint does not support Solana devnet for
> managed wallets — its accepted-chains enum lists `solana` (mainnet) only,
> with no `solana-devnet`. Probed both `2022-06-09` and `2025-06-09` API
> versions; no testnet variant for Solana. Options were (a) flip the whole
> stack to mainnet and burn real USDC, (b) switch to an EVM testnet, or (c)
> ship custodial embedded wallets on devnet via direct SPL. Chose (c) — keeps
> the Anchor program on devnet, no real money on the demo, same
> `WalletProvider` interface so Crossmint can swap in later for production /
> mainnet operator UX (passkey signers).

```
Add a WalletProvider interface and the embedded-Solana implementation.
Designed to swap providers later (Crossmint, Privy, Turnkey) without
touching callers.

Files to create in apps/backend/src/wallet/:
- provider.ts: export interface WalletProvider with:
    createWallet(responderId: string): Promise<{ address: string }>
    getAddress(responderId: string): Promise<string | null>
    getBalanceUsdc(address: string): Promise<number>
    signAndSendUsdc(args: { toAddress: string, amountUsdc: number, memo?: string }):
      Promise<{ txSignature: string }>
- embedded.ts: export class EmbeddedSolanaProvider implements WalletProvider
    Generates per-operator Solana keypairs; encrypts secret with AES-256-GCM
    using WALLET_ENCRYPTION_KEY; persists { walletAddress, encryptedWalletSecret }
    on the Operator document (encryptedWalletSecret marked `select: false`).
    Reads USDC balances via the SPL associated token account.
    Signs USDC SPL transfers with the agent keypair (reuses
    SOLANA_OPERATOR_KEYPAIR — already funded with SOL for fees).
- crossmint.ts: kept in repo as a future-mainnet stub — not wired into the
    factory. Revisit once we go to production with Crossmint mainnet.
- index.ts: export createWalletProvider(config): WalletProvider — factory
    keyed off WALLET_PROVIDER env var.

Env additions in apps/backend/.env.example and config.ts:
- WALLET_PROVIDER (default 'embedded-solana')
- WALLET_ENCRYPTION_KEY (required, 32 bytes hex / 64 hex chars)
- USDC_MINT_ADDRESS — Solana devnet (Circle):
    4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

Operator model (apps/backend/src/db/models/operator.ts):
- walletAddress: String, indexed (lookup-by-address for incoming payouts)
- encryptedWalletSecret: String, select:false (never returned by default)

Smoke test scripts/wallet-smoke.ts:
- Creates a synthetic Operator
- create wallet for that responderId → print address
- getAddress round-trip
- createWallet idempotency check
- get balance for the agent wallet (SOLANA_OPERATOR_KEYPAIR pubkey) →
  prints real funded balance > 0
- Cleans up the synthetic Operator
Do NOT actually transfer in this script — just exercise read paths.

Pre-smoke setup (one time per environment):
1. Generate WALLET_ENCRYPTION_KEY: `openssl rand -hex 32` → put in .env.local
2. Get the agent pubkey: `solana-keygen pubkey ~/.config/solana/roam-operator.json`
3. Fund SOL for fees if not already: `solana airdrop 2 <agent_pubkey> --url devnet`
4. Create the agent's USDC ATA + fund it. Easiest path:
     a. Create a USDC account for the agent:
        `spl-token create-account 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
           --owner <agent_pubkey> --url devnet`
     b. Fund via Circle's faucet (https://faucet.circle.com/) → paste the
        agent pubkey, choose Solana Devnet, USDC. The faucet creates the ATA
        if (a) wasn't run.

Out of scope: paying operators (AD-11), mobile-side wallet UX (AD-12).

Acceptance:
- pnpm --filter @roam/backend typecheck passes
- scripts/wallet-smoke.ts creates a wallet, prints address, prints balance > 0
```

**Checklist before AD-3:**
- [x] WalletProvider interface defined; EmbeddedSolanaProvider implements all methods
- [x] Config validates wallet env vars (throws if WALLET_ENCRYPTION_KEY missing/wrong shape)
- [x] CrossmintProvider kept as unwired stub for future mainnet revisit
- [x] Smoke script creates a wallet on devnet
- [x] Agent USDC ATA funded (devnet USDC > 0; verified 20 USDC on 2026-05-04)

---

## AD-3 — Push notifications (Expo)

```
Wrapper around expo-server-sdk-node so the backend can fan out push notifications
to operators on dispatch.

Install in apps/backend: expo-server-sdk

Files to create in apps/backend/src/push/:
- expo.ts: export
    sendPushToOperators(responderIds: string[], message: { title, body, data: object }):
      Promise<{ tickets: ExpoPushTicket[] }>
    Implementation:
      - Look up each operator's pushTokens from MongoDB
      - Filter to valid Expo tokens (Expo.isExpoPushToken)
      - Chunk via expo.chunkPushNotifications (Expo's 100-msg limit)
      - Send via expo.sendPushNotificationsAsync, return tickets

Env additions:
- EXPO_ACCESS_TOKEN (optional — only needed for standalone production app; Expo Go
  delivers without it for the demo)

Smoke test scripts/push-smoke.ts:
- Manually set a known operator pushToken (from an Expo Go install)
- Fire a "test dispatch" notification with data: { type: 'test' }
- Confirm it arrives on the device

Out of scope: mobile-side push registration (AD-12), receipt polling.

Acceptance:
- scripts/push-smoke.ts delivers a push to a real device
- typecheck clean
```

**Checklist before AD-4:**
- [x] expo-server-sdk installed in backend workspace
- [x] sendPushToOperators chunks correctly
- [ ] Smoke push received on test device  ← needs PUSH_SMOKE_TOKEN from a device + run `pnpm --filter @roam/backend push:smoke`

---

## AD-4 — STT integration (Deepgram)

```
Speech-to-Text client. For demo we ingest audio uploads (Deepgram prerecorded API)
plus stub the streaming API for live calls.

Install in apps/backend: @deepgram/sdk

Files to create in apps/backend/src/agent/transcribe.ts:
- transcribeAudioFile(audioBuffer: Buffer, mimeType: string):
    Promise<{ transcript: string, confidence: number }>
    Uses Deepgram Nova-3 with smart_format and punctuate
- transcribeAudioStream(audioStream: Readable, onPartial: (text: string) => void):
    Promise<string>
    Streaming via Deepgram WebSocket; calls onPartial as utterances come in;
    resolves with the final transcript when the stream closes

Env additions:
- DEEPGRAM_API_KEY (required)
- STT_PROVIDER (default 'deepgram')

Test fixture: commit a 5–10s test wav under apps/backend/test/fixtures/sample-call.wav
("There's a hazmat spill at 4th and Main, two casualties, smoke visible…").

Smoke test scripts/stt-smoke.ts:
- Reads the test fixture
- Calls transcribeAudioFile, prints transcript + confidence
- Should match expected text within ~5 words

Out of scope: actually wiring this into incident creation (AD-7), live call audio source.

Acceptance:
- File-based transcription returns text with confidence > 0.8 on the fixture
- Streaming method type-checks (no live source needed this session)
```

**Checklist before AD-5:**
- [ ] @deepgram/sdk installed
- [ ] Smoke script transcribes the fixture correctly
- [ ] Streaming code compiles (live test deferred to AD-7)

---

## AD-5 — Agent tools (read-only)

```
Build the read-only tool surface the agent calls to gather context. No LLM yet — just
the tool implementations and their schemas.

Install in apps/backend: zod-to-json-schema

Files to create in apps/backend/src/agent/tools/:
- index.ts: exports an `agentTools` array of { name, description, input_schema } in
  Anthropic tool-use format, plus a `dispatchToolCall(name, input, ctx)` that routes
- classifyIncident.ts: takes the current transcript, returns IncidentClassification
  This session: rule-based stub (look for keywords like "fire", "medical", "hazmat";
  parse "at <street> and <street>" patterns). Real LLM-driven classification happens
  inside the agent loop in AD-6 — this stub is the fallback / smoke-test target.
- findNearestVehicles.ts: input { lat, lon, radiusKm, requiredCapabilities? }
    Uses 2dsphere $near on vehicle.lastTelemetry.location
    Filters by status='available' and (if requiredCapabilities) by
    assignedOperators having ANY of those capabilities
    Returns up to 5: { id, callsign, distanceMeters, assignedResponderIds }
- getResponderStatus.ts: input { responderIds: string[] }
    Returns { id, callsign, availability, capabilities, walletAddress: bool } per id
- getActiveIncidents.ts: returns currently 'live' or 'briefed' incidents
    so the agent can avoid double-dispatching

Each tool gets a Zod input schema, a JSON-schema description (zod-to-json-schema), and
a typed handler. Handlers receive (input, ctx) where ctx has db handles + logger.

Smoke test scripts/agent-tools-smoke.ts:
- Seeds 3 vehicles around Miami (varying capabilities) + operators
- Calls each tool with a sample input, prints the result

Out of scope: the LLM runner (AD-6), draftBriefing tool (AD-6).

Acceptance:
- All 4 tools callable from smoke script with correct, schema-validated outputs
- typecheck clean
```

**Checklist before AD-6:**
- [ ] All 4 tools implemented with Zod input + JSON schema
- [ ] findNearestVehicles uses the 2dsphere index (verify with explain plan)
- [ ] Smoke script returns valid data for each tool

---

## AD-6 — Agent runner (Claude tool-use loop)

```
Build the Claude tool-use loop that produces a Briefing from a transcript.

Install in apps/backend: @anthropic-ai/sdk

Files to create in apps/backend/src/agent/:
- llm.ts: thin wrapper around @anthropic-ai/sdk that runs a tool-use loop
    runAgent(args: { systemPrompt, userMessage, tools, onTool, maxTurns }):
      Promise<{ finalMessage, toolCalls }>
- prompts.ts: buildSystemPrompt(), buildIncidentBriefingPrompt(transcript)
    System prompt: "You draft tactical mission briefings for a dispatcher to review.
    You only recommend; the dispatcher confirms. Use tools to query data. Output by
    calling draftBriefing exactly once when ready, with the full briefing payload."
- runner.ts: brief(incidentId: string, ctx): Promise<Briefing>
    1. Load incident + transcript
    2. Run runAgent with the dispatch tools and system prompt
    3. Agent classifies, queries, then emits final tool call: draftBriefing(payload)
    4. Validate payload against BriefingSchema (partial — runner fills _id, generatedAt,
       generatedByModel, briefingHash)
    5. Compute briefingHash (sha256 of canonicalized JSON: summary + recommendations + payout)
    6. Persist Briefing document, return it

Add in apps/backend/src/agent/tools/draftBriefing.ts:
- Input shape: Briefing minus _id/generatedAt/generatedByModel/briefingHash
- Handler doesn't persist — it just returns the validated payload to the runner

Env additions:
- ANTHROPIC_API_KEY (required)
- ANTHROPIC_MODEL (default 'claude-opus-4-7')
- AGENT_MAX_TURNS (default 8)

Smoke test scripts/agent-smoke.ts:
- Seeds an incident with a hardcoded transcript
- Calls brief(incidentId), prints the resulting Briefing JSON
- Verifies briefingHash is deterministic (running twice on same input → same hash)

Out of scope: voice ingest (AD-7), dispatch creation (AD-8), Solana writes (AD-10).

Acceptance:
- Smoke script produces a coherent Briefing with valid recommendedVehicleIds (matching
  seeded vehicles), urgency, payout, summary
- Agent uses ≥2 tool calls before draftBriefing
- briefingHash deterministic across runs
- typecheck clean
```

**Checklist before AD-7:**
- [ ] @anthropic-ai/sdk installed
- [ ] runAgent loops correctly (handles multi-turn tool use)
- [ ] brief() persists a Briefing and returns it
- [ ] briefingHash stable across runs

---

## AD-7 — Voice ingest endpoint + live incident

```
Add an oRPC procedure that accepts audio (or test transcript), creates an Incident,
transcribes it, fires the agent, and broadcasts updates over WebSocket.

Files to create:
- apps/backend/src/rpc/procedures/incidents.ts:
    incidents.ingest: input { audio?: base64 string, mimeType?: string,
                              transcript?: string }
      Exactly one of audio/transcript must be provided.
      If audio: transcribe via Deepgram (file-mode for now)
      If transcript: use directly (test mode)
      Persists Incident with status='live', transcript, transcriptHash (sha256 hex)
      Fires brief() async (does not block the response)
      Broadcasts incident.created over WS broadcaster
      When briefing is ready, broadcasts briefing.ready
      Returns the Incident immediately

    incidents.list: returns recent incidents
    incidents.get(id): returns Incident with classification + Briefing joined

- apps/backend/src/ws/incidentBroadcaster.ts: same pattern as sessionBroadcaster
- apps/backend/src/rpc/router.ts: register incidents procedures
- packages/api/src/index.ts: re-export the new procedure types

Define the contract in apps/backend/src/rpc/builder.ts (or wherever existing oRPC
input/output schemas live) so packages/api can consume types.

Out of scope: dispatch confirmation (AD-8), live audio streaming (post-hackathon).

Acceptance:
- POST a transcript-only payload via curl → incident created
- briefing.ready event arrives over /ws/incidents within ~10s
- POST an audio payload → same outcome
- incidents.get returns the Incident with the Briefing populated
- typecheck clean
```

**Checklist before AD-8:**
- [ ] incidents.ingest handles both audio + transcript inputs
- [ ] Async briefing broadcast works
- [ ] incidents.get returns joined Briefing within reasonable time

---

## AD-8 — Dispatch flow (oRPC procedures)

```
Add the dispatch procedures: confirm a briefing → create Dispatch → fan out push.
Plus: accept/decline with first-to-claim race semantics.

Files to create/extend:
- apps/backend/src/rpc/procedures/dispatch.ts:

    dispatch.confirm: input { briefingId, decisionMaker: 'human'|'ai-auto',
                              decidedBy?: responderId, requiredAccepts?: number = 1,
                              expiresInSecs?: number = 60 }
      1. Load briefing; verify briefing.briefingHash matches stored canonicalization
      2. Create Dispatch with status='pending', expiresAt, claimedByResponderIds: []
      3. Update Incident.status = 'dispatched'
      4. Call sendPushToOperators(briefing.recommendedResponderIds, {
           title: incidentType, body: summary,
           data: { type: 'dispatch.created', dispatchId, payoutUsdc }})
      5. Broadcast dispatch.created over /ws/dispatch
      6. Return the Dispatch document

    dispatch.respond: input { dispatchId, responderId, decision: 'accept'|'decline',
                              declineReason? }
      1. Persist DispatchResponse (idempotent via unique compound index — duplicate
         is a CONFLICT)
      2. If decision='accept' and dispatch is still pending and
         claimedByResponderIds.length < requiredAccepts:
         - findOneAndUpdate atomic: $push responderId to claimedByResponderIds with
           guard $expr: { $lt: [ { $size: "$claimedByResponderIds" }, "$requiredAccepts" ] }
         - If now full, set status='claimed'
      3. If decision='accept' but already full: return CONFLICT 'dispatch_already_claimed'
      4. Broadcast dispatch.responded over WS
      5. Return { response, dispatch }

    dispatch.list: list active dispatches
    dispatch.get(id): single dispatch with all responses

- packages/api/src/index.ts: export procedure types
- apps/backend/src/rpc/router.ts: register dispatch

Out of scope: payments (AD-11), Solana writes (AD-10), auto-confirm (AD-16).

Acceptance:
- Confirm a briefing via curl → dispatch created, push fired
- Two concurrent accepts (use a small parallel script): only first claims, second
  gets CONFLICT
- Decline records the response without claiming
- expiresAt set correctly; expired dispatches do not accept new claims
- typecheck clean
```

**Checklist before AD-9:**
- [ ] Race-condition test passes (only first concurrent accept claims)
- [ ] Decline records without claiming
- [ ] Push fires on confirm
- [ ] Expired dispatches reject accepts

---

## AD-9 — Anchor program: record_dispatch + record_response

> **SUPERSEDED 2026-05-06.** The on-chain program was rewritten to a single
> `record_event` instruction with six event kinds (`received`, `dispatched`,
> `accepted`, `rejected`, `arrived`, `cleared`) — see CLAUDE.md "Active". The
> `record_dispatch` / `record_response` split below was never built. Plan kept
> for historical context.

```
Add Solana on-chain audit instructions next to the existing record_session.

> Run from programs/roam.

In programs/roam/src/lib.rs, add two new instructions:

#[derive(Accounts)]
#[instruction(dispatch_id: [u8; 16], briefing_hash: [u8; 32], transcript_hash: [u8; 32])]
pub struct RecordDispatch<'info> {
    #[account(init, payer = operator, space = 8 + DispatchRecord::INIT_SPACE,
        seeds = [b"dispatch", &dispatch_id], bump)]
    pub dispatch: Account<'info, DispatchRecord>,
    #[account(mut)] pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

DispatchRecord: dispatch_id, briefing_hash, transcript_hash, decision_maker (u8: 0=human, 1=ai-auto), decided_at (i64).

#[derive(Accounts)]
#[instruction(dispatch_id: [u8; 16], operator_id_hash: [u8; 32])]
pub struct RecordResponse<'info> {
    #[account(init, payer = operator, space = 8 + ResponseRecord::INIT_SPACE,
        seeds = [b"response", &dispatch_id, &operator_id_hash], bump)]
    pub response: Account<'info, ResponseRecord>,
    #[account(mut)] pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

ResponseRecord: dispatch_id, operator_id_hash, decision (u8: 0=accept, 1=decline), responded_at (i64).

Notes:
- 16-byte dispatch_id: convert MongoDB ObjectId(12 bytes) padded to 16, OR derive a
  16-byte UUID. Document the convention in lib.rs comments.
- operator_id_hash = sha256(operator UUID) — never put raw operator IDs on chain.
- Hashes only — full payloads stay in MongoDB.

Run anchor build (regenerates IDL). Copy target/idl/roam.json to
packages/solana-client/src/idl.json.

Update tests in programs/roam/tests/ to cover both new instructions.
Deploy to devnet: anchor deploy --provider.cluster devnet.

Out of scope: backend wiring (AD-10), payouts (AD-11).

Acceptance:
- anchor test passes locally
- packages/solana-client typechecks against new IDL
- Devnet deploy succeeds (or document blocker — airdrop, etc.)
- New program ID matches the existing one (upgrade in place, not a new deployment)
```

**Checklist before AD-10:**
- [ ] anchor test passes for both new instructions
- [ ] IDL copied to solana-client
- [ ] Devnet deploy completes (or blocker documented in CLAUDE.md)
- [ ] Existing record_session still works (no regression)

---

## AD-10 — Solana client helpers + wire dispatch async

> **SUPERSEDED 2026-05-06.** Functionally absorbed by the unified `record_event`
> design: `recordIncidentEvent()` in `apps/backend/src/services/incidentEvents.ts`
> wraps the Mongo insert + non-blocking `withSolanaProvider` chain write +
> `solanaTxSignature` writeback + `incident.event.chain` broadcast, and is fired
> from `dispatch.confirm` / `dispatch.respond` for the `dispatched` / `accepted`
> / `rejected` event kinds. Dead `solanaTxSignature` fields removed from
> `Dispatch` + `DispatchResponse` schemas the same day. Plan kept for historical
> context.

```
Add backend helpers that call the new instructions, and wire them into
dispatch.confirm / dispatch.respond as async writes (same pattern as
recordSessionStartOnChain in apps/backend/src/rpc/procedures/auth.ts).

Files to extend:
- packages/solana-client/src/index.ts:
    recordDispatchOnChain(provider, args: { dispatchId, briefingHash,
      transcriptHash, decisionMaker }): Promise<string>
    recordResponseOnChain(provider, args: { dispatchId, responderIdHash,
      decision }): Promise<string>

- apps/backend/src/rpc/procedures/dispatch.ts:
    After Dispatch row created in confirm, fire recordDispatchAsync(...).
    On success, update Dispatch.solanaTxSignature and broadcast
    dispatch.chain_recorded. On failure, log but do not break the response.

    After DispatchResponse persisted in respond, fire recordResponseAsync(...).
    On success, update response.solanaTxSignature and broadcast.

Out of scope: payouts (AD-11).

Acceptance:
- End-to-end: confirm a dispatch → MongoDB row gets solanaTxSignature within ~5s
- Solana Explorer link resolves to a confirmed tx (devnet)
- Same for accept/decline
- pnpm typecheck clean across the monorepo
```

**Checklist before AD-11:**
- [ ] Both helpers implemented
- [ ] Async wiring matches existing session pattern (non-blocking, broadcaster on settle)
- [ ] Dispatch + response txs visible on Solana Explorer

---

## AD-11 — Payouts (USDC SPL transfer on accept)

```
Pay operators in USDC the moment they accept a dispatch. Uses the WalletProvider
abstraction from AD-2 — currently EmbeddedSolanaProvider, which signs with the
agent keypair (SOLANA_OPERATOR_KEYPAIR) and sends an SPL transfer on the
configured cluster. Recipient ATA is auto-created on first payout.

This session is also the first real exercise of WalletProvider.signAndSendUsdc;
the AD-2 smoke only covered read paths.

Files to create/extend:
- apps/backend/src/payouts/index.ts:
    payOperatorOnAccept(args: { dispatchId, responderId }): Promise<Payout>
      1. Load dispatch + operator (must have walletAddress)
      2. amountUsdc = dispatch.payoutUsdc
      3. Persist Payout row with status='pending'
      4. walletProvider.signAndSendUsdc({ toAddress: operator.walletAddress,
                                           amountUsdc, memo: dispatchId })
         (The memo arg is accepted by the interface; the EmbeddedSolanaProvider
         currently ignores it — wire in a SPL Memo program instruction here so
         the dispatch ID is anchored on chain alongside the transfer.)
      5. On success: Payout.status='settled', solanaTxSignature, settledAt
      6. On error: Payout.status='failed', error message
      7. Broadcast payout.settled (or .failed) over WS

- apps/backend/src/rpc/procedures/dispatch.ts: in respond, after a successful
  accept-claim, fire payOperatorOnAccept asynchronously (non-blocking).

Pre-flight: agent USDC ATA must be funded with enough USDC to cover the demo's
expected payouts (devnet USDC is free — top up via Circle faucet between runs).
Agent SOL must also be funded for fees (target: > 0.5 SOL on the agent).

Out of scope: refunds, dispute flow, dynamic pricing tweaks (post-hackathon).

Acceptance:
- Accept a dispatch on devnet → operator's wallet shows incoming USDC
  within ~10s (verify on Solana Explorer with cluster=devnet)
- Payout row has solanaTxSignature; explorer link resolves to the SPL
  transfer (and the Memo instruction encodes the dispatchId)
- Operator without walletAddress → payout fails gracefully (status='failed',
  error populated, dispatch still marked claimed). Won't happen if AD-12
  auto-provisions on enrol, but keep the guard — operators created via
  dashboard or script may pre-date the auto-provision wiring.
```

**Checklist before AD-12:**
- [ ] payOperatorOnAccept end-to-end works on devnet
- [ ] Payout row tracks status transitions correctly
- [ ] SPL Memo instruction includes the dispatchId
- [ ] Failure case (no walletAddress) handled cleanly

---

## AD-12 — Mobile: push token registration + wallet display

```
On mobile login, register the device's Expo push token. Provision the
operator's wallet server-side at enrol time so mobile can read the address
without having to manage keys or call a wallet SDK.

Why the change from the original plan: the embedded-Solana provider (AD-2)
is custodial — the backend holds the encrypted secret. There is no
operator-facing key material on mobile, so no SDK / sign-in step is needed.
Mobile just displays operator.walletAddress that the backend already knows.

Install in apps/mobile: expo-notifications.
(No Crossmint mobile SDK — see AD-2 pivot. Adding a mobile-managed wallet
would require switching to a non-custodial provider, which is a post-hackathon
decision.)

Files to create in apps/mobile/src/:
- push.ts: registerPushToken(responderId): Promise<void>
    - getPermissionsAsync, requestPermissionsAsync, getExpoPushTokenAsync
    - POST to backend responders.upsertPushToken
- screens/Login.tsx (or existing auth flow): after auth, await registerPushToken
- screens/Profile.tsx (or wherever operator info shows): display
  operator.walletAddress (fetched as part of the operator object); copy-to-
  clipboard affordance for demo convenience.

Backend additions:
- apps/backend/src/rpc/procedures/operators.ts:
    1. extend `enrol` to call walletProvider.createWallet(operator._id) right
       after the upsert. createWallet is idempotent (AD-2), so re-enrolling
       an existing operator is safe. Return the operator object with
       walletAddress populated.
    2. add responders.upsertPushToken({ responderId, token }) — pushes to
       operator.pushTokens (de-duped on equal value).

Out of scope: dispatch UI (AD-13). Mobile-side key custody / non-custodial
wallet UX (post-hackathon if/when we move to mainnet).

Acceptance:
- Mobile login → operator record gets pushTokens; walletAddress is already
  populated (set at enrol)
- Login on a second device adds a second pushToken (de-duped on equal value)
- Wallet address visible in operator profile screen
```

**Checklist before AD-13:**
- [ ] Push token registered on login
- [ ] enrol auto-provisions wallet via WalletProvider.createWallet
- [ ] Wallet address rendered in profile screen
- [ ] Multiple devices supported

---

## AD-13 — Mobile: dispatch accept/decline UI

```
When a dispatch push notification arrives, open a modal showing the briefing summary
with accept/decline buttons. Wire to dispatch.respond.

Files to create in apps/mobile/src/:
- dispatch/Notifications.tsx: registers an expo-notifications handler.
    On data-bearing dispatch push (data: { type: 'dispatch.created', dispatchId }):
      - Fetch dispatch + briefing via dispatch.get
      - Open DispatchModal with the data
- dispatch/DispatchModal.tsx: the UI component
    Large (cold-finger) ACCEPT and DECLINE buttons
    Countdown timer to expiresAt
    Decline-reason picker (free-text + presets: "off-shift", "too far", "no capability")
    Briefing summary, payout USDC prominently displayed
- dispatch/api.ts: thin wrappers calling dispatch.respond

Post-accept state:
- Show "Claim received — payout incoming" with the wallet balance
- Poll wallet.getBalance every 2s for up to 30s; stop when balance increases or
  the 30s window passes
- Show the Solana Explorer link for the payout tx when it lands

Foreground vs background:
- If the app is foregrounded when the push arrives: open the modal directly
- If backgrounded: tap on the notification opens the app and shows the modal

Out of scope: dashboard UI (AD-14), audit-trail browser (AD-15).

Acceptance:
- A dispatch confirmed on the dashboard triggers a push that opens the modal
- Accept → call succeeds, modal shows payout-incoming state, balance updates
- Decline → call succeeds, modal closes
- Two phones receive the push; only one's accept claims (other gets CONFLICT alert)
```

**Checklist before AD-14:**
- [ ] Push handler opens modal in foreground + background
- [ ] Accept flow updates wallet balance within ~15s on devnet
- [ ] Decline flow dismisses cleanly with reason recorded
- [ ] CONFLICT case shows a clear message, not a crash

---

## AD-14 — Dashboard: live incident + briefing review

```
Dispatcher view: live incidents with streaming transcript, briefing-review panel,
confirm button.

Files to create/extend in apps/dashboard:
- app/incidents/[id]/page.tsx (match existing app dir structure):
    Live transcript pane (subscribes to WS for incident.transcript_partial events;
      if AD-7 didn't yet broadcast partials, add that broadcast in this session)
    Classification card: incidentType, urgency, location, requiredCapabilities
    Briefing card (when ready): summary, recommended vehicles + operators with
      distance, payout breakdown
    CONFIRM DISPATCH button (large, primary). Calls dispatch.confirm with
      decisionMaker='human', decidedBy=current dispatcher responderId
    Decline ALL button (secondary, destructive style) — sets incident.status='cancelled'

- components/IncidentList.tsx: list view of live + briefed incidents on the main
  map page. Click → navigates to /incidents/[id].

Add a useIncidentSocket hook to packages/api (mirror useTelemetrySocket).

Out of scope: dispatch tracker (AD-15), auto-confirm (AD-16).

Acceptance:
- Trigger an incident (curl POST to incidents.ingest) → dashboard shows live transcript
- Briefing card renders within ~10s
- Confirm → Dispatch row created, panel transitions to "Awaiting accepts" state
- Two browser windows show the same live updates
```

**Checklist before AD-15:**
- [ ] Live transcript streams cleanly
- [ ] Briefing renders with all fields populated
- [ ] Confirm transitions UI to dispatch-pending state

---

## AD-15 — Dashboard: dispatch tracker + audit trail

```
Show real-time dispatch state and a chain-derived audit page.

Files to create in apps/dashboard:
- components/DispatchTracker.tsx: rendered inside the incident detail view once a
  dispatch exists.
    Live list of operators in the dispatch with their current state:
      pending / accepted (with timestamp) / declined (with reason) / paid (with tx)
    Each row links to the Solana Explorer for that operator's response tx and
    (when payout settles) the USDC transfer tx.
    Updates live via /ws/dispatch.

- app/audit/page.tsx: chain-derived metrics page.
    Reads from MongoDB initially (cheap path); flag in code that production should
    read from Solana RPC via getProgramAccounts.
    Show:
      - All dispatches with decisionMaker breakdown (human vs ai-auto count)
      - Per-operator: total accepts, declines, decline rate, total USDC earned
      - Each row links to the Solana Explorer for verification

Out of scope: actually reading directly from Solana RPC (post-hackathon).

Acceptance:
- DispatchTracker reflects accepts/declines within ~1s
- All Explorer links resolve to confirmed txs
- Audit page totals match what's in MongoDB
- Auditing across multiple incidents works (paginated or scrollable)
```

**Checklist before AD-16:**
- [ ] DispatchTracker live-updates correctly
- [ ] Explorer links work for response + payout txs
- [ ] Audit page renders without errors

---

## AD-16 — Auto-confirm demo mode

```
Add an autonomous-mode toggle. Same audit trail; just no human approval gate.

Files to create in apps/dashboard:
- components/AutoConfirmToggle.tsx: a header toggle.
    State persisted in localStorage so it survives reload.
- app/incidents/[id]/page.tsx: when toggle is ON and a briefing.ready event arrives:
    Show a 3-second countdown overlay with a CANCEL button
    On countdown end (uncancelled): POST dispatch.confirm with decisionMaker='ai-auto'
    On cancel: revert to manual review

- components/DecisionMakerBadge.tsx: prominent badge on every dispatch view:
    AI AUTO (red) vs HUMAN (green)

Backend: no new code — dispatch.confirm already accepts decisionMaker.

Out of scope: per-incident-type auto rules, human-override mid-flight (post-hackathon).

Acceptance:
- Toggle on → next incident triggers a 3s countdown then auto-confirms
- Cancel during countdown halts the auto-confirm cleanly
- Audit trail shows decisionMaker='ai-auto' for the autonomous dispatch
- Demo can be flipped human ↔ auto mid-session without restart
```

**Checklist before AD-17:**
- [ ] Toggle persists across reloads
- [ ] Countdown is cancelable
- [ ] decisionMaker correctly recorded on-chain (verify via Explorer)

---

## AD-17 — End-to-end devnet smoke + demo polish

```
Full agentic-dispatch flow on devnet, timed, polished, ready for stage.

Setup:
- Backend running with embedded-Solana wallet (devnet) + Anthropic + Deepgram + Expo configured
- Dashboard running locally or on a public URL
- Two phones with Expo Go, both logged in as different operators
- iot-bridge sim-fleet running with 3 vehicles around the demo location
- Devnet Solana with the upgraded program

HUMAN MODE scenario (run twice — first to find issues, second clean):
1. POST a transcript to incidents.ingest (use a hazmat scenario for color)
2. Watch dashboard: live transcript, classification, briefing renders
3. Click CONFIRM DISPATCH
4. Both phones get push notifications
5. Phone A accepts → payout fires → balance updates on Phone A within ~15s
6. Phone B sees CONFLICT alert (already claimed)
7. Open Solana Explorer for: incident.transcriptHash, dispatch tx, response tx,
   USDC transfer tx — all four resolve to confirmed transactions

AI-AUTO mode scenario:
1. Toggle auto-confirm ON
2. POST another incident → 3s countdown → auto-fires
3. Same accept + payout flow
4. Audit page shows decisionMaker='ai-auto' on the second dispatch

Time the end-to-end (T+0 = transcript posted; T+N = operator wallet credited).
Target: < 15s on devnet. Document the actual time.

Polish items if found in run-through:
- Add a /api/demo-reset endpoint that cancels active dispatches and resets
  vehicle status — lets you reset between demo runs without restart
- Pre-seed 3 sample transcripts in /demo-transcripts so you can hit the demo
  flow with a button click instead of curl

Wrap up:
- Update CLAUDE.md "Current focus" to: "Agentic dispatch ready — May 5-7 2026 Miami"
- Commit with message "feat: agentic dispatch end-to-end"
- Tag: git tag v1.0.0-agentic-dispatch
```

**Checklist before demo day:**
- [ ] Both human + ai-auto flows complete end-to-end
- [ ] All four on-chain artifacts visible on devnet Explorer per dispatch
- [ ] T+0 → operator-paid is under 15s
- [ ] Demo reset works between runs
- [ ] Tag pushed

---

## Note — Auth, current state vs. production plan (judge talking points)

**What's in the demo:**
The mobile app boots and auto-enrols a responder using a name from
`EXPO_PUBLIC_RESPONDER_NAME` (default `RSP-1`). This is a deliberate
dev-mode auto-login — it lets us iterate without re-typing credentials
during the build, and shrinks demo-day stage time to "open app → live."
Push tokens are linked to the responder on boot. The custodial Solana
wallet (AD-2) is provisioned automatically at enrol so responders never
manage keys.

**What production looks like (one slide of work, not done for the hackathon):**
- Responders are pre-enrolled by an admin in the dispatch org (name +
  PIN + auto-provisioned wallet). No self-serve registration — same as
  any real-world dispatch system: your org issues your credentials.
- Mobile login screen: name + PIN on first launch, PIN-only on
  subsequent launches (name cached in `expo-secure-store`). Long-lived
  session token cached the same way; valid token = silent boot straight
  to the map.
- All RPC procedures protected by a token-verifying middleware that
  resolves `ctx.user`. WS endpoints carry the token in a query param.
- Push token registration moves from "boot" to "post-login" so a device
  can be reassigned to a different responder by signing out and signing
  back in as someone else.
- Dispatcher auth on the dashboard mirrors the same flow with a `role`
  check on dispatcher-only routes (confirm dispatch, view audit trail).

**Why deferred:**
Auth touches every RPC + WS surface and is independent of the core
demo story (911 → AI dispatch → on-chain accountability). The
hackathon judges are evaluating the agentic dispatch + Solana audit
trail; a polished login screen doesn't change that pitch. Post-hackathon
this is a 1–2 day AD-block that drops in cleanly because the
identity primitives (responder, custodial wallet, push token list) are
already in place — the missing piece is just the credential layer
(`pinHash` field, `auth.signIn` RPC, session token, middleware).

**Wallet sign-in (e.g. Phantom / wallet-adapter)?**
Not relevant while wallets are custodial — the backend holds the keys,
so there's nothing on the responder's device to sign with. If we ever
move responders to non-custodial wallets (probably a mainnet decision,
not a devnet one), wallet-based sign-in becomes an option, but the
trade-off is responders having to manage keys on a device they may share
or lose mid-shift. The custodial model is intentional for an emergency
dispatch context.
