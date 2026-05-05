# Escape Room Mission Platform — Phase 1 prototype

A web-based, mobile-first platform for hosting escape-room-style scavenger-hunt
games. See [`../PRD.md`](../PRD.md) for the full product spec. This folder
implements **Phase 1** of the rollout: text + photo missions, linear
prerequisites, manual team setup, GM judging.

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript + Tailwind v4**
- **Supabase local** (Postgres 17, GoTrue auth, Storage) via Docker

## Prerequisites

- Node.js 20.9+
- Docker Desktop running
- npm

## First-time setup

```bash
# Install dependencies
npm install

# Start the local Supabase stack (Postgres, Auth, Storage, Studio)
npx supabase start

# Apply the v1 schema migration + reset the DB to a clean state
npx supabase db reset
```

Supabase ports have been remapped to **64xxx** (config.toml) to dodge Windows
Hyper-V port reservations. After `supabase start` you should see:

| Service | URL |
|---|---|
| API | http://127.0.0.1:64321 |
| DB  | postgresql://postgres:postgres@127.0.0.1:64322/postgres |
| Studio | http://127.0.0.1:64323 |
| Inbucket (test emails) | http://127.0.0.1:64324 |

The values in `.env.local` are already wired up to these ports.

## Running

```bash
npm run dev
```

Open <http://localhost:3000>.

## End-to-end demo flow (5 minutes)

1. **Sign up as a GM** — go to `/signup`, create an account (any email works
   locally; Inbucket captures the confirmation email but auto-confirm is on for
   local dev).
2. **Create a game** — click "Host a game" → "+ New game" → enter a name. Note
   the **join code** (e.g., `K3F9X2`) shown in the dashboard.
3. **Add a couple of teams** — e.g. "Red Team" and "Blue Team".
4. **Add missions** — click "+ Add mission". Try at least:
   - One **auto-validated text** mission (e.g. title "Capital of Malaysia",
     expected answer "Kuala Lumpur").
   - One **GM-judged photo** mission (e.g. "Take a photo of the front door").
   - One mission with the first as a **prerequisite** so you can see the
     unlock chain.
5. **Sign up as a player** — open an incognito window, go to `/signup`, create
   a second account.
6. **Join the game** — click "Join a game" → paste the join code → pick a
   team → see the mission list (with locked/unlocked states).
7. **Submit answers** — open the auto-validated text mission, type the right
   answer; it auto-approves and unlocks any dependent missions. Try the photo
   mission and submit a picture.
8. **Judge as the GM** — go back to the GM tab, refresh the game page, and
   approve/reject the photo submission.

## Project layout

```
escape-room/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                            # landing page
│   │   ├── login/                              # auth
│   │   ├── signup/
│   │   ├── games/                              # GM flows
│   │   │   ├── page.tsx                        # list my games
│   │   │   ├── new/page.tsx                    # create game
│   │   │   └── [id]/
│   │   │       ├── page.tsx                    # GM dashboard (teams + missions + judge queue)
│   │   │       └── missions/new/page.tsx       # mission editor
│   │   └── play/                               # player flows
│   │       ├── page.tsx                        # enter join code
│   │       └── [code]/
│   │           ├── page.tsx                    # team picker + mission list
│   │           └── m/[missionId]/page.tsx      # submit a mission
│   ├── components/
│   │   └── Header.tsx
│   ├── lib/
│   │   ├── auth-actions.ts                     # login / signup / logout server actions
│   │   ├── gm-actions.ts                       # GM mutations
│   │   ├── player-actions.ts                   # player mutations
│   │   └── supabase/
│   │       ├── client.ts                       # browser Supabase client
│   │       ├── server.ts                       # server Supabase client (await cookies())
│   │       ├── proxy.ts                        # session refresh helper
│   │       └── database.types.ts               # generated from schema
│   └── proxy.ts                                # Next 16 middleware (renamed)
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 20260505000000_init.sql             # Phase-1 schema + RLS + triggers
└── .env.local                                  # local Supabase keys (gitignored)
```

## Next.js 16 things to know

- `cookies()`, `headers()`, `params`, `searchParams` are **all async** — must `await`.
- `middleware.ts` is renamed to **`proxy.ts`**, and the function is now `proxy()`.
- Turbopack is the default dev runner — no flag needed.
- Page props use the generated `PageProps<"/route/path">` helper; rerun
  `npx next typegen` if route types feel out of date.

## What's stubbed for now (Phase 2 work)

- GPS / video submissions
- Per-team mission assignment
- Branching prerequisites + time gates
- **Time-sensitive missions / deadlines** (the auto-fail worker)
- Web push notifications
- Live realtime leaderboard
- Per-team color-themed mission view

See `../PRD.md` §8 for the full Phase 2 list.

## Common commands

```bash
# Start the dev server
npm run dev

# Type check
npx tsc --noEmit

# Regenerate Next.js route types (after adding/renaming routes)
npx next typegen

# Regenerate Supabase TS types after schema changes
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts

# Reset the database (drops everything, re-runs migrations)
npx supabase db reset

# Stop the local Supabase stack
npx supabase stop
```

## Troubleshooting

**`bind: An attempt was made to access a socket in a way forbidden`** — Windows
Hyper-V is reserving the port. Check with
`netsh int ipv4 show excludedportrange protocol=tcp` and bump the affected port
in `supabase/config.toml`.

**Photo upload returns 403** — RLS or storage policy. Check the policies in the
init migration; the `submissions` bucket allows authenticated uploads.

**Can't log in after signup** — local Supabase has email confirmation disabled
by default, but if you turned it on in `config.toml`, check Inbucket at
<http://127.0.0.1:64324> for the confirmation email.
