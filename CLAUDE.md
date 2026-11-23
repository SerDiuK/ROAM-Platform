# ROAM Platform

AI-powered emergency dispatch and fleet accountability platform built on Solana.

When a 911 call comes in, an AI agent listens in real time, transcribes and classifies the incident, checks unit availability and proximity, and proposes the optimal dispatch within seconds. The dispatcher reviews and approves in one tap. Units are notified on their mobile app and en route.

Every step — received, dispatched, accepted or rejected, cleared — is written to Solana as an immutable transaction. Response times cannot be altered. Chain of custody cannot be disputed. Clearing a dispatch also settles it over x402, with no invoice or accounts payable.

Built for the EasyA Consensus Hackathon, Miami, May 2026.

## Demo scenario

Multi-vehicle crash at Biscayne Blvd & NE 36th St, Miami. Two ambulances dispatched simultaneously. Live GPS feed from a vehicle on screen next to the dashboard. Solana transactions visible in real time as each ambulance is dispatched and its crew accepts.

## Repository layout

This is a pnpm + Turborepo monorepo.

```
apps/backend        Fastify API · Aedes MQTT broker · MongoDB · Solana
apps/dashboard      Next.js dispatcher view · react-leaflet live map
apps/mobile         Expo React Native app · native iOS/Android client
apps/iot-bridge     Node.js on Raspberry Pi · reads GPS NMEA · publishes MQTT telemetry
apps/sim-fleet      Fleet simulator · spawns N iot-bridge instances with route-file playback
apps/cli            oclif admin CLI · incident ingest, dispatch ops
packages/shared     Zod schemas, TypeScript types and the oRPC contract shared by all apps
packages/api        oRPC client + reconnecting WebSocket hooks
packages/ui         Shared design tokens, formatters, cn()
packages/solana-client  Anchor IDL + record_event transaction builders
programs/roam       Anchor/Rust Solana program (incident event log)
```

## Commands

```bash
pnpm install                          # install all workspaces
pnpm dev                              # start all apps concurrently
pnpm build                            # build all apps
pnpm typecheck                        # type check all packages
pnpm --filter @roam/backend dev       # backend only (port 3001)
pnpm --filter @roam/dashboard dev     # dashboard only (port 3000)
pnpm --filter @roam/mobile dev        # Expo dev server for the dev-client build
pnpm --filter @roam/iot-bridge dev    # IoT bridge only (simulated GPS by default)
pnpm --filter @roam/sim-fleet dev     # check in the demo fleet; FLEET_CONFIG replays routes
pnpm roam                             # admin CLI
```

## Code conventions

- TypeScript strict mode everywhere — no `any`, no type assertions without a comment explaining why
- Named exports only — no default exports except where a framework needs one: Next.js `page.tsx`/`layout.tsx` (`export { Foo as default }` keeps the function name) and oclif commands
- All Zod schemas live in `packages/shared/src` — never redefine types in app code, always import from `@roam/shared`
- Env vars are validated with Zod in each app's `src/config.ts` — never access `process.env` directly anywhere else in the codebase
- Errors are typed — no throwing raw strings, no silent `catch {}` blocks (surface failures via a typed result, a connection flag, or a thrown typed error)
- Async functions always have explicit return types. React components do **not** need return-type annotations — TS infers `JSX.Element | null` correctly and the noise hurts readability.

App-specific frontend conventions (file layout, state, memoization, design tokens) live in each app's own `CLAUDE.md`:
- `apps/dashboard/CLAUDE.md`

## Architecture rules

- MQTT topic: `vehicles/{callsign}/telemetry` (IoT bridge → backend)
- All dates stored as MongoDB `Date`, transmitted as ISO strings over HTTP API, converted to `BN` (big number) for Solana
- Backend Solana writes are non-blocking: the events the backend records itself (received, dispatched, a CLI clear) go to the chain in the background, so those calls succeed even if Solana is slow or down. The Seeker-signed accept, decline and clear need the chain
- Domain vocabulary: emergency-services. **Responders** (medics) sign in with their Seeker (Sign-in-with-Solana) and are bound to a responder **name** on first sign-in. **Dispatchers** approve briefings. **Vehicles** keep callsigns (e.g., `MEDIC-1`); **responders** use names. Fleet is ambulance-only — only responder capability is `medic`.

## Key files

- `packages/shared/src/responder.ts` — responder schema + role/availability/capability enums
- `packages/shared/src/contracts.ts` — oRPC contract for every API route
- `apps/backend/src/config.ts` — all environment variable definitions
- `apps/backend/src/rpc/procedures/sessionAuth.ts` — Sign-in-with-Solana
- `apps/backend/src/rpc/procedures/auth.ts` — check-in and check-out logic
- `apps/backend/src/rpc/procedures/dispatch.ts` — dispatch confirm, Seeker-signed accept/decline/clear
- `apps/backend/src/agent/runner.ts` — Claude briefing agent
- `apps/backend/src/mqtt/handlers.ts` — telemetry ingestion pipeline
- `programs/roam/src/lib.rs` — Solana smart contract (record_event instruction; per-step incident lifecycle log)
- `packages/solana-client/src/idl.json` — generated Anchor IDL

## Solana

- Program ID: `Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy`
- Anchor 0.31.1, Solana CLI 3.x (Agave)
- Build: `anchor build` (IDL only) + `cargo build-sbf --manifest-path programs/roam/Cargo.toml --sbf-out-dir target/deploy`
- Deploy: `anchor deploy --provider.cluster <cluster>`
- Test: `anchor test --skip-build` (local validator; `Anchor.toml` defaults to localnet)
- Keypair: `~/.config/solana/roam-operator.json` (Solana fee-payer; named "operator" in Solana network terminology, unrelated to in-app responder/dispatcher roles)

## Environment setup

The backend, IoT bridge, fleet simulator and mobile app each have a `.env.example`. Copy it to `.env.local` and fill in values before running.
Never commit `.env.local` files — they are in `.gitignore`.

Required for full local dev:
- MongoDB: `docker compose up -d mongo` (port 27018) or an Atlas connection string
- The IoT bridge simulates GPS by default (`LOCATION_SOURCE=simulate`), so no Raspberry Pi is needed
- Solana local validator (`solana-test-validator`) or devnet airdrop for Solana integration
- Rust + Anchor CLI + Solana CLI for smart contract development

Reset local demo data:

```bash
mongosh "mongodb://localhost:27018/roam?directConnection=true" --eval 'db.dropDatabase()'
pnpm --filter @roam/backend seed   # responders, fleet, demo incidents
```

## Mobile

- Needs a dev-client build (`eas build --profile development --platform android`, then `adb install`); Expo Go can't load the Mobile Wallet Adapter native module.
- The Seeker's Seed Vault needs at least one Solana account; the app authorizes against `solana:devnet`.
