# ROAM Platform

[![CI](https://github.com/SerDiuK/ROAM-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/SerDiuK/ROAM-Platform/actions/workflows/ci.yml)

AI-powered emergency dispatch and fleet accountability on Solana, built for the EasyA Consensus Hackathon in Miami, 5–7 May 2026.

When a 911 call comes in, an AI agent listens in real time, transcribes and classifies the incident, checks which units are free and nearby, and proposes a dispatch within seconds. The dispatcher approves it in one tap, and the crews get it on their phones.

Every step after that is a Solana transaction: the backend records the call and the dispatch, and each responder's own Solana Mobile Seeker signs their acceptance, and the clearance when they close the job from the app. Response times can't be changed afterwards, and the chain of custody can't be disputed. The same on-chain record settles the job: completion settles over the x402 protocol, with no invoice and no accounts payable.

The demo scenario is a multi-vehicle crash at Biscayne Blvd & NE 36th St, Miami. Two ambulances are dispatched at once, one vehicle's live GPS feed runs next to the dashboard, and Solana transactions land in real time as each ambulance is dispatched and its crew accepts.

## Highlights

- **The responder's phone signs the record.** Accepting or declining a dispatch, and clearing it from the app, are `record_event` instructions signed by the responder's Seeker as the attestor, while the operator key pays the fee.
- **Exactly the right number of crews.** Accepting a dispatch is one atomic MongoDB update that only succeeds while claims are below `requiredAccepts`, so simultaneous taps can't over-assign a call.
- **Dispatch never waits on the chain.** Solana writes are non-blocking: operations go through even when Solana is slow or unreachable.
- **Passwordless sign-in.** Sign-in-with-Solana through the Mobile Wallet Adapter takes one fingerprint, and the wallet session is cached for silent re-authorisation.
- **Payment over HTTP 402.** Completing a dispatch runs the x402 protocol: the server answers 402 with a settlement spec, and the client retries with a signed Solana payment. Built by Arjen van Gaal.
- **Real hardware, or none.** A Raspberry Pi 5 reads GPS over serial and publishes telemetry over MQTT, and the fleet simulator replays routes for any number of vehicles, so the whole system runs on a laptop.
- **One schema everywhere.** Zod schemas in `packages/shared` type the API, the live telemetry, the dashboard and the app end to end over oRPC.
- **Built with Claude Code**, session by session, from the plan in [`docs/ROAM-Tasks.md`](docs/ROAM-Tasks.md).

## Demo

- [End-to-end demo](https://drive.google.com/file/d/1hUOJiqB6wVJGL29Kw7Rb31atHGUzaG8Y/view?usp=drive_link) — full system in action.
- [Repo walkthrough](https://drive.google.com/file/d/1NKnXrKabCbmse314Kgd5K6qtFnqOAxO7/view?usp=sharing) — guided tour of the codebase.

**Mobile (responder)**

<a href="https://drive.google.com/file/d/1Bd18n86DyV4-B7nvhXkuHcwmE2XgalFj/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1Bd18n86DyV4-B7nvhXkuHcwmE2XgalFj&sz=w800" width="320" alt="Responder mobile app" /></a> <a href="https://drive.google.com/file/d/1ygaxEPoTBM8Mu7drS7dSSsfGCuImAF_w/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1ygaxEPoTBM8Mu7drS7dSSsfGCuImAF_w&sz=w800" width="320" alt="Responder mobile app" /></a>

**Dispatcher command center**

<a href="https://drive.google.com/file/d/1nkhCFjtsPIzW-3UkVi9pl2BXiw46MjBr/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1nkhCFjtsPIzW-3UkVi9pl2BXiw46MjBr&sz=w1400" width="800" alt="Dispatcher dashboard" /></a>

## How it works

1. **Ingest** — A 911 recording (or transcript) is posted to the backend, transcribed with Deepgram, and classified by incident type, urgency and location.
2. **Propose** — A Claude agent with tool access finds the nearest capable units, checks crew availability and other active incidents, and drafts a briefing for the dispatcher.
3. **Approve** — The dispatcher accepts the briefing in one tap. Responders receive a push notification on their mobile app.
4. **Attest on-chain** — Each responder signs their accept or decline, and a clearance made from the app, as `record_event` instructions with their Solana Mobile Seeker as the attestor. The operator key co-signs as fee payer and records the call, the dispatch and any clearance made from the CLI itself.
5. **Settle** — Completion runs through the [x402 protocol](https://www.x402.org/): `POST /api/dispatch/complete` first replies **HTTP 402 Payment Required** with a SOL settlement spec, the client retries with a signed payment transaction in the `X-Payment` header, and the server verifies and submits it on-chain. The same Solana log doubles as the audit trail and the payout receipt — no invoices, no accounts payable.

## Architecture

```
   911 audio ──▶ Backend (Fastify)         MQTT broker (Aedes)
                  │  ├─ LLM transcribe          ▲      │
                  │  ├─ Classify + dispatch     │      ▼
                  │  └─ MongoDB persistence    IoT bridge (Pi 5)
                  │                             ▲      │
                  ▼                             │      ▼
   Dashboard ◀── oRPC / WebSockets        GPS NMEA serial
   (Next.js)                                    
                  ▲
                  │
   Mobile (Expo + Solana Mobile)
                  │
                  ▼
              Solana program
              (record_event PDA per incident × kind × responder)
```

- **MQTT topics:** `vehicles/{vehicleId}/telemetry` (IoT bridge → backend), `vehicles/{vehicleId}/commands` (backend → IoT bridge).
- **Auth:** Sign-in-with-Solana (SIWS) over Mobile Wallet Adapter. The Seeker holds the responder's identity and signs the accept, decline and clear events made from the app. No passwords, no PINs.
- **Solana writes are non-blocking** — operational paths must succeed even if Solana is slow or temporarily unreachable.

## Repository layout

This is a [pnpm](https://pnpm.io) + [Turborepo](https://turbo.build/repo) monorepo.

```
apps/
├── backend          Fastify API · oRPC · Aedes MQTT broker · MongoDB · Solana writes
├── dashboard        Next.js dispatcher UI · react-leaflet live map · live telemetry
├── mobile           Expo React Native client · Solana Mobile Wallet Adapter · push
├── iot-bridge       Node.js on Raspberry Pi · reads GPS NMEA · publishes MQTT telemetry
├── sim-fleet        Fleet simulator · spawns N iot-bridge instances with route playback
└── cli              oclif-based admin CLI (incident ingest, dispatch ops)

packages/
├── shared           Zod schemas + TypeScript types shared by all apps (single source of truth)
├── api              oRPC client + reconnecting WebSocket hooks for telemetry
├── ui               Shared UI primitives, design tokens, formatters
└── solana-client    Anchor IDL + record_event transaction builders

programs/
└── roam             Anchor/Rust Solana program — incident lifecycle audit trail
```

### Solana program

- **Program ID:** `Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy`
- **Anchor:** 0.31.1 · **Solana CLI:** 3.x (Agave)
- **Single instruction:** `record_event` writes a per-step PDA per `(incident, kind, responder)` tuple.
- **Event kinds:** `received`, `dispatched`, `accepted`, `rejected`, `cleared`, and a reserved `arrived` that nothing records yet.
- **Co-signing model:** the operator pubkey is the fee payer. The attestor is the Seeker on the responder's phone for accept, decline and a clear made from the app, and the operator for `received`, `dispatched` and a clear made from the CLI.

## Commands

```bash
pnpm install                          # install all workspaces
pnpm dev                              # start all apps concurrently
pnpm build                            # build all apps
pnpm typecheck                        # type-check all packages

pnpm --filter @roam/backend dev       # backend only (port 3001)
pnpm --filter @roam/dashboard dev     # dashboard only (port 3000)
pnpm --filter @roam/mobile dev        # Expo dev server
pnpm --filter @roam/iot-bridge dev    # IoT bridge (simulated GPS by default)
pnpm --filter @roam/sim-fleet dev     # check in the demo fleet; FLEET_CONFIG replays routes
pnpm roam                             # admin CLI
```

### Solana program

```bash
anchor build                                                                    # IDL only
cargo build-sbf --manifest-path programs/roam/Cargo.toml --sbf-out-dir target/deploy
anchor deploy --provider.cluster <cluster>
```

## Conventions

- **TypeScript strict mode** everywhere — no `any`, no type assertions without an inline justification.
- **Named exports only** — Next.js `page.tsx`/`layout.tsx` use `export { Foo as default }` to keep function names.
- **All Zod schemas** live in `packages/shared/` — never redefine types in app code.
- **Env vars** validated with Zod in each app's `src/config.ts` — never read `process.env` directly elsewhere.
- **Domain vocabulary:** *responders* (medics) sign in with their Seeker; *dispatchers* approve briefings; *vehicles* keep callsigns (e.g. `MEDIC-1`).

## Environment setup

The backend, IoT bridge, fleet simulator and mobile app each have a `.env.example`. Copy it to `.env.local` and fill in values before running. `.env.local` is git-ignored.

Required for full local dev:

- MongoDB: `docker compose up -d mongo` (port 27018) or an Atlas connection string
- No Raspberry Pi needed: the IoT bridge simulates GPS by default (`LOCATION_SOURCE=simulate`)
- Solana local validator (`solana-test-validator`) or devnet airdrop
- Rust + Anchor CLI + Solana CLI for smart-contract development
- For mobile: a Solana Mobile Seeker (or compatible MWA wallet) with a funded devnet account, plus your own Google Maps key as `GOOGLE_MAPS_API_KEY` in `apps/mobile/.env.local` and your own Firebase `apps/mobile/google-services.json`, since the one in the repo is revoked

## Hardware

- **Pi 5 (`roam-1`)** — primary IoT bridge with U-blox GPS over USB serial.
- **Pi 4 (`roam-2`)** — secondary node.
- **Solana Mobile Seeker** — responder device; runs the Expo dev-client build (`eas build --profile development --platform android`, `adb install`).

## Prior work

The IoT bridge (Pi GPS → MQTT, plus the simulator path), an early Expo mobile shell wiring up Solana Mobile Wallet Adapter, the pnpm/Turborepo monorepo scaffolding with shared Zod schemas and oRPC plumbing, and exploratory Anchor/Solana program experiments were in place before the hackathon. The dispatch lifecycle on top — LLM-driven incident ingestion, the dispatch engine, the `record_event` instruction with per-step PDAs, SIWS auth, x402 settlement, and the dispatcher dashboard — is the hackathon build.

## Status and credits

A hackathon prototype on Solana devnet, not a production system. Built by Thomas Goethals, with the x402 settlement flow by Arjen van Gaal.

## License

[MIT](LICENSE)
