# ROAM Platform

AI-powered emergency dispatch and fleet accountability platform built on Solana.

When a 911 call comes in, an AI agent listens in real time, transcribes and classifies the incident, checks unit availability and proximity, and proposes the optimal dispatch within seconds. The dispatcher reviews and approves in one tap. Units are notified on their mobile app and en route.

Every event — dispatch, en route, on scene, cleared — is written to Solana as an immutable transaction. Response times cannot be altered. Chain of custody cannot be disputed. The on-chain record also settles the commerce transaction autonomously, with no invoice or accounts payable.

Presenting at EasyA Consensus Hackathon, Miami, May 5–7 2026.

## Demo scenario

Multi-vehicle crash at Biscayne Blvd & NE 36th St, Miami. Two ambulances dispatched simultaneously. Live GPS feed from a vehicle on screen next to the dashboard. Four Solana transactions visible in real time: Medic 12 dispatched, Medic 08 dispatched, Medic 12 on scene, Medic 08 on scene.

## Repository layout

This is a pnpm + Turborepo monorepo.

```
apps/backend        Fastify API · Aedes MQTT broker · MongoDB · Solana
apps/dashboard      Next.js dispatcher view · react-leaflet live map
apps/mobile         Expo React Native app · native iOS/Android client
apps/iot-bridge     Node.js on Raspberry Pi · reads GPS NMEA · publishes MQTT telemetry
apps/sim-fleet      Fleet simulator · spawns N iot-bridge instances with route-file playback
packages/shared     Zod schemas + TypeScript types shared by all apps
packages/solana-client  Anchor IDL + recordSessionOnChain() helper
programs/roam       Anchor/Rust Solana program (session audit trail)
```

## Commands

```bash
pnpm install                          # install all workspaces
pnpm dev                              # start all apps concurrently
pnpm build                            # build all apps
pnpm typecheck                        # type check all packages
pnpm --filter @roam/backend dev       # backend only (port 3001)
pnpm --filter @roam/dashboard dev     # dashboard only (port 3000)
pnpm --filter @roam/mobile dev        # Expo dev server (scan QR with Expo Go)
pnpm --filter @roam/iot-bridge dev    # IoT bridge only (SIMULATE=true for dev)
pnpm --filter @roam/sim-fleet dev    # spawn 3-vehicle fleet with route playback
```

## Code conventions

- TypeScript strict mode everywhere — no `any`, no type assertions without a comment explaining why
- Named exports only — no default exports anywhere (Next.js `page.tsx`/`layout.tsx` use `export { Foo as default }` to keep the function name)
- All Zod schemas live in `packages/shared/src/schemas.ts` — never redefine types in app code, always import from `@roam/shared`
- Env vars are validated with Zod in each app's `src/config.ts` — never access `process.env` directly anywhere else in the codebase
- Errors are typed — no throwing raw strings, no silent `catch {}` blocks (surface failures via a typed result, a connection flag, or a thrown typed error)
- Async functions always have explicit return types. React components do **not** need return-type annotations — TS infers `JSX.Element | null` correctly and the noise hurts readability.

App-specific frontend conventions (file layout, state, memoization, design tokens) live in each app's own `CLAUDE.md`:
- `apps/dashboard/CLAUDE.md`

## Architecture rules

- MQTT topics: `vehicles/{vehicleId}/telemetry` (IoT bridge → backend), `vehicles/{vehicleId}/commands` (backend → IoT bridge)
- All dates stored as MongoDB `Date`, transmitted as ISO strings over HTTP API, converted to `BN` (big number) for Solana
- NFC UIDs are always hashed before storage: `sha256(rawUid + NFC_PEPPER)` — raw UIDs are never persisted
- Solana writes are non-blocking — session checkout must succeed even if Solana is slow or down
- Domain vocabulary: emergency-services. **Responders** (medics) sign in by **name** and PIN. **Dispatchers** approve briefings. **Vehicles** keep callsigns (e.g., `MEDIC-1`); **responders** use names. Fleet is ambulance-only — only responder capability is `medic`.

## Key files

- `packages/shared/src/responder.ts` — responder schema + role/availability/capability enums
- `packages/shared/src/schemas.ts` — single source of truth for all data shapes
- `apps/backend/src/config.ts` — all environment variable definitions
- `apps/backend/src/rpc/procedures/auth.ts` — check-in and check-out logic
- `apps/backend/src/mqtt/handlers.ts` — telemetry ingestion pipeline
- `programs/roam/src/lib.rs` — Solana smart contract (record_event instruction; per-step incident lifecycle log)
- `packages/solana-client/src/idl.json` — generated Anchor IDL

## Solana

- Program ID: `Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy`
- Anchor 0.31.1, Solana CLI 3.x (Agave)
- Build: `anchor build` (IDL only) + `cargo build-sbf --manifest-path programs/roam/Cargo.toml --sbf-out-dir target/deploy`
- Deploy: `anchor deploy --provider.cluster <cluster>`
- Keypair: `~/.config/solana/roam-operator.json` (Solana fee-payer; named "operator" in Solana network terminology, unrelated to in-app responder/dispatcher roles)

## Environment setup

Each app has a `.env.example`. Copy to `.env.local` and fill in values before running.
Never commit `.env.local` files — they are in `.gitignore`.

Required for full local dev:
- MongoDB running locally or Atlas connection string
- `SIMULATE=true` in iot-bridge env to generate fake GPS without a Raspberry Pi
- Solana local validator (`solana-test-validator`) or devnet airdrop for Solana integration
- Rust + Anchor CLI + Solana CLI for smart contract development

After pulling the responder rename: drop and re-seed local Mongo (collections changed: `operators` → `responders`, plus field renames):

```bash
mongosh "mongodb://localhost:27018/roam?directConnection=true" --eval 'db.dropDatabase()'
pnpm --filter @roam/backend seed   # runs responders:seed + incidents:seed
pnpm --filter @roam/sim-fleet dev
```

## Current focus

See docs/ROAM-Tasks.md for the session-by-session build plan.
Update the "Current focus" line below as you complete each session.

**Active:** Seeker-only Sign-in-with-Solana shipped, then slimmed to the Solana Mobile reference path (per `~/.claude/plans/do-it-in-plan-squishy-waffle.md`). PIN auth deleted entirely. SIWS now uses MWA's `sign_in_payload`: `auth.siwsChallenge` returns `{ nonce, domain, statement, expiresAt }`; mobile passes those into `wallet.authorize({ sign_in_payload })` and ships the returned `sign_in_result.{address, signed_message, signature}` (all base64) to `auth.siwsVerify`. One `transact` / one fingerprint per sign-in. The MWA `auth_token` is cached in expo-secure-store for silent warm-boot reauthorize. Dispatch accept/decline runs `prepareResponseTx` → `mwa.signAndSendTransaction` (wallet signs as attestor *and* submits to its own RPC) → `commitSignedResponse`. The fee_payer/attestor split (operator = fee_payer, Seeker = attestor on `record_event`) and first-to-claim atomicity are unchanged. DispatchResponse model still carries `solanaTxSignature` + `attestorPubkey`.

**Open before demo:**
- Cut a new dev-client build via `eas build --profile development --platform android`; `adb install` on each Seeker.
- Run `pnpm --filter @roam/backend exec tsx scripts/seeker-smoke.ts` against devnet to confirm the SIWS+chain ceremony before stage time. Requires `SOLANA_OPERATOR_KEYPAIR` funded.
- Demo at EasyA Consensus is 2026-05-07. Drop+reseed local Mongo (`mongosh ... --eval 'db.dropDatabase()' && pnpm --filter @roam/backend seed`).

**Follow-ups (out of scope):**
- AD-2 custodial wallet (Responder.encryptedWalletSecret) is dead weight under Seeker auth — drop alongside AD-11 payouts redirecting to the Seeker pubkey.
- Dashboard dispatcher SIWS auth.

Earlier shipped: incident event log on Solana — fresh program (`Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy`) with one instruction, `record_event`, that writes a per-step PDA per `(incident, kind, responder)` tuple. Six event kinds: `received`, `dispatched`, `accepted`, `rejected`, `arrived`, `cleared`. `arrived` is reserved as event_kind 4 — nothing flips an incident to `arrived` yet; GPS-proximity trigger ships in a follow-up plan. AD-22 off-chain session removal (Responder.currentVehicleId is the canonical pairing). AD-2 + AD-3 + AD-12 shipped 2026-05-04; terminology rename (operator→responder, commander→dispatcher, callsign→name on people) also 2026-05-04.

**Seeker setup:**
- Seed Vault initialized with at least one Solana account; cluster passed at MWA `authorize` time as `solana:devnet`.
- USB debugging enabled; `adb install` the dev-client build (Expo Go cannot load MWA native module — same constraint as AD-12 native push).
- Optional `SOLANA_RPC_URL_FALLBACK` in `apps/backend/.env.local` for stage-time RPC flake.
