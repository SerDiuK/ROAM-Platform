# ROAM Platform

AI-powered emergency dispatch and fleet accountability platform built on Solana. Every dispatch event — received, dispatched, accepted, on-scene, cleared — is an immutable on-chain transaction signed by the responder's Solana Mobile Seeker.

## Demo

[Repo walkthrough video](https://drive.google.com/file/d/1NKnXrKabCbmse314Kgd5K6qtFnqOAxO7/view?usp=sharing) — guided tour of the codebase.

**Mobile (responder)**

<a href="https://drive.google.com/file/d/1Bd18n86DyV4-B7nvhXkuHcwmE2XgalFj/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1Bd18n86DyV4-B7nvhXkuHcwmE2XgalFj&sz=w800" width="320" alt="Responder mobile app" /></a> <a href="https://drive.google.com/file/d/1ygaxEPoTBM8Mu7drS7dSSsfGCuImAF_w/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1ygaxEPoTBM8Mu7drS7dSSsfGCuImAF_w&sz=w800" width="320" alt="Responder mobile app" /></a>

**Dispatcher command center**

<a href="https://drive.google.com/file/d/1nkhCFjtsPIzW-3UkVi9pl2BXiw46MjBr/view?usp=sharing"><img src="https://drive.google.com/thumbnail?id=1nkhCFjtsPIzW-3UkVi9pl2BXiw46MjBr&sz=w1400" width="800" alt="Dispatcher dashboard" /></a>

## How it works

1. **Ingest** — A 911 audio stream (or transcript) is fed to the backend, which uses an LLM to extract location, urgency, and required capability.
2. **Propose** — The dispatch engine ranks available responders by distance and capability and presents one or more candidates to a human dispatcher.
3. **Approve** — The dispatcher accepts the briefing in one tap. Responders receive a push notification on their mobile app.
4. **Attest on-chain** — Each responder signs the `record_event` instruction with their Solana Mobile Seeker, attesting their own dispatch, accept, on-scene, and clear events. The operator key co-signs as fee payer.
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
- **Auth:** Sign-in-with-Solana (SIWS) over Mobile Wallet Adapter. The Seeker holds the responder's identity and signs every dispatch event. No passwords, no PINs.
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
└── solana-client    Anchor IDL + recordSessionOnChain() helper

programs/
└── roam             Anchor/Rust Solana program — incident lifecycle audit trail
```

### Solana program

- **Program ID:** `Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy`
- **Anchor:** 0.31.1 · **Solana CLI:** 3.x (Agave)
- **Single instruction:** `record_event` writes a per-step PDA per `(incident, kind, responder)` tuple.
- **Event kinds:** `received`, `dispatched`, `accepted`, `rejected`, `arrived`, `cleared`.
- **Co-signing model:** operator pubkey is the fee payer; the Seeker on each responder's phone is the attestor.

## Commands

```bash
pnpm install                          # install all workspaces
pnpm dev                              # start all apps concurrently
pnpm build                            # build all apps
pnpm typecheck                        # type-check all packages

pnpm --filter @roam/backend dev       # backend only (port 3001)
pnpm --filter @roam/dashboard dev     # dashboard only (port 3000)
pnpm --filter @roam/mobile dev        # Expo dev server
pnpm --filter @roam/iot-bridge dev    # IoT bridge (set SIMULATE=true for fake GPS)
pnpm --filter @roam/sim-fleet dev     # 3-vehicle simulated fleet with route playback
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
- **NFC UIDs** are always hashed before storage (`sha256(rawUid + NFC_PEPPER)`); raw UIDs are never persisted.
- **Domain vocabulary:** *responders* (medics) sign in with their Seeker; *dispatchers* approve briefings; *vehicles* keep callsigns (e.g. `MEDIC-1`).

## Environment setup

Each app has a `.env.example`. Copy to `.env.local` and fill in values before running. `.env.local` is git-ignored.

Required for full local dev:

- MongoDB (local or Atlas connection string)
- `SIMULATE=true` in iot-bridge env to generate fake GPS without a Raspberry Pi
- Solana local validator (`solana-test-validator`) or devnet airdrop
- Rust + Anchor CLI + Solana CLI for smart-contract development
- For mobile: a Solana Mobile Seeker (or compatible MWA wallet) with a funded devnet account

## Hardware

- **Pi 5 (`roam-1`)** — primary IoT bridge with U-blox GPS over USB serial.
- **Pi 4 (`roam-2`)** — secondary node.
- **Solana Mobile Seeker** — responder device; runs the Expo dev-client build (`eas build --profile development --platform android`, `adb install`).

## License

Hackathon project — license TBD post-event.
