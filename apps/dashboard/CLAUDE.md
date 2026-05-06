# Dashboard CLAUDE.md

Frontend conventions for `@roam/dashboard`. Project-wide rules live in the
repo-root `CLAUDE.md`; this file only covers what's specific to the dispatcher
UI.

## Stack

- Next.js 15 App Router (`src/app/page.tsx` is the only route — single-page
  command center, no nested routes by design)
- React 19 with `"use client"` on every component file (the dashboard renders
  entirely client-side — server components have no role here)
- Tailwind v4 + `@roam/ui` design tokens
- oRPC client + WebSockets via `@roam/api` (no React Query, no Jotai today)
- `react-leaflet` for the map; loaded via `next/dynamic({ ssr: false })`

## Directory layout

```
src/
├── app/                   Next.js entry — page.tsx + layout.tsx + globals.css
├── components/
│   ├── features/          Feature-shaped components (one folder per feature)
│   │   ├── left-sidebar/  Fleet panel + vehicle detail
│   │   ├── right-sidebar/ Incidents panel + incident detail
│   │   ├── map/           Live map + dynamic-loaded inner
│   │   ├── sessions/      On-chain session feed
│   │   └── top-bar.tsx    Header strip
│   └── ui/                App-local primitives (sidebar shell, buttons, icon,
│                          status pill, etc). Cross-app primitives live in
│                          `@roam/ui` instead.
├── hooks/                 Reusable hooks (usePollingResource, useFleetData…)
└── lib/                   App glue — config, api client wrapper
```

Co-locate per-component helpers next to the component, not in `lib/`:

- `foo.tsx` — the component
- `foo.utils.ts` — pure helpers (no React)
- `foo.hooks.ts` — component-scoped hooks

## State management

We use plain `useState` + custom hooks. No Jotai, no Redux, no Zustand. If
state needs to span more than two sibling components, extract a hook that
encapsulates the data + the setter.

- **Polling data**: use `usePollingResource(loader, initial, intervalMs)` from
  `hooks/use-polling-resource.ts`. It handles cancellation, retry, and the
  loading/connected/data triple. Wrap per-resource hooks on top
  (`useFleetData`, `useIncidentsData`).
- **Streaming data**: use the WS hooks from `@roam/api`
  (`useTelemetrySocket`, `useSessionSocket`). They reconnect automatically and
  return `{ data, connected }`.
- **UI state** (selection, sidebar open/close): keep in `page.tsx` as the
  single owner. Pass setters down — React guarantees setter identity, so
  passing `setSelectedX` directly is fine and doesn't need `useCallback`.
- **Derived state**: `useMemo` if the derivation is non-trivial (Map
  construction, sort, filter over a list that updates frequently).

## Memoization rules

These matter because telemetry updates many times per second:

- Wrap **callback props** in `useCallback` when the callback closes over
  multiple state setters or composes a side effect (e.g. select-and-open).
- Setters from `useState` are referentially stable — pass them directly.
- Wrap **derived collections** (sorted lists, filtered lists, `Map`
  constructions) in `useMemo` when they live in a component that re-renders
  on telemetry.
- For module-level caches that depend only on inputs (e.g. Leaflet `DivIcon`),
  use a `Map<key, value>` at module scope — see
  `components/features/map/map-inner.tsx`.

Don't preemptively wrap leaf components in `React.memo` — only do it once
profiling shows a hot path. The single biggest perf lever is keeping callback
props stable.

## Components

- **Named exports only**, never `export default`. The one exception is
  `page.tsx` (Next App Router needs a default), and we use the
  `export { Page as default }` form to keep the function name searchable.
- **Prop types** declared as `type FooProps = { ... }` at the top of the
  file; not interfaces, not inline. Pull props that get reused into a named
  type.
- **No `React.FC`**. Just `function Foo(props: FooProps) { ... }`.
- **`"use client"`** at the top of every component file. The dashboard has no
  server components.
- **Slide-in detail panels** (`incident-detail.tsx`, `vehicle-detail.tsx`)
  hold a `lastFooRef` so content stays visible during the slide-out
  animation. If you add a third panel, extract a shared `SlidePanel`
  primitive rather than copying the pattern.
- **Compound components**: prefer one component per file. If a sub-component
  is private to its parent and under ~30 lines with no own state, inlining
  is fine; otherwise split it out.

## Design tokens

All colors, status mappings, and label dictionaries live in `@roam/ui`. Never
hardcode hex values or duplicate label maps in app code.

- `STATUS_HEX` / `STATUS_LABEL` / `STATUS_TONE` — vehicle status
- `URGENCY_HEX` / `URGENCY_LABEL` / `URGENCY_TONE` — incident urgency
- `formatRelative`, `formatDistance`, `formatHHMM`, `formatDuration` — date/
  number formatting

If you need a new token, add it to `packages/ui/src/` and re-export from
`packages/ui/src/index.ts`. Don't fork tokens into app-local files.

Tailwind class strings *are* allowed to live near the component — e.g. the
`URGENCY_TINT` map in `urgency-badge.tsx` and `incident-tags.tsx` keeps
`bg-danger/15 text-danger` close to where it's used. The principle: tokens
(values, tones, labels) are shared; visual variants (Tailwind class strings)
are local.

## Loading / empty / error states

Every data-dependent surface must handle four states. The current minimum:

- **Loading**: text fallback (`"Loading incidents…"`) is OK for now;
  skeleton loaders are a P2 follow-up.
- **Empty**: icon + message centered in the container.
- **Error**: a `connected: boolean` pill in the footer of the relevant panel.
  We do **not** silently swallow errors — `usePollingResource` flips
  `connected` to false and keeps the last good data.
- **Success**: the actual content.

Wrap async-heavy subtrees in an `<ErrorBoundary>` once one is added (P2).

## Config and env

- `lib/config.ts` is the **only** file allowed to read `process.env`. It
  Zod-validates the schema once at module load — bad envs crash the dashboard
  immediately rather than producing 404s deep in fetches.
- All `NEXT_PUBLIC_*` vars must be referenced by literal name (e.g.
  `process.env.NEXT_PUBLIC_BACKEND_URL`) — Next inlines them at build time
  and any computed access defeats the inlining.

## Map

- The map runs entirely client-side; `live-map.tsx` is a `next/dynamic`
  wrapper around `map-inner.tsx` with `ssr: false`.
- Marker icons are `DivIcon` instances built via `renderToStaticMarkup`. We
  cache them at module scope keyed by their inputs — never construct a new
  icon per render.
- The map sits beneath both sidebars (`absolute inset-0`); controls anchor to
  the right edge with a CSS variable that responds to `rightSidebarOpen`.

## Naming conventions

- **Domain vocabulary** mirrors the rest of the codebase: `responder` (not
  operator), `dispatcher` (not commander), `vehicle.callsign` for
  vehicle-side identifiers, `responder.name` for people. After the 2026-05-04
  rename, single-letter `o` variables read as "operator" — use `r`/
  `responder` instead, even in tight loops.
- **Files**: kebab-case (`incident-detail.tsx`, `use-fleet-data.ts`).
- **Components**: `PascalCase`. `IconButton`, not `IconBtn`.
- **Hooks**: `useFooBar` (camelCase, `use` prefix).
- **CSS classes**: Tailwind utilities only; no `.module.css`.

## Anti-patterns

- ❌ Inline arrow functions for callback props — they break any future
  memoization. Use `useCallback`.
- ❌ Re-implementing polling per component. Compose `usePollingResource`.
- ❌ Hardcoded hex colors or status labels in app code. Pull from `@roam/ui`.
- ❌ Silent `catch {}` blocks. Surface failures via a connection state or a
  toast (toast UX is a P2 follow-up; for now flip a `connected` flag).
- ❌ Default exports.
- ❌ `process.env.X` outside `lib/config.ts`.
- ❌ Reading or redefining Zod schemas in app code. Always import from
  `@roam/shared`.
