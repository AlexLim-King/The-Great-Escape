# Project Handoff — Escape Room Mission Platform

**Last updated:** 2026-05-12
**Status:** Working local prototype, ~16 commits in. Phase 1 + most of Phase 2 from `PRD.md` is done; a few items remain.

This document is for **resuming work in a fresh conversation**. Read this plus [`PRD.md`](./PRD.md) and you have the full picture.

---

## 1. TL;DR — what this is

A Goosechase-style scavenger-hunt platform where a **game master (GM)** designs missions with branching unlock graphs and **teams of players** complete them by submitting text / photo / video. Built as a mobile-first web app, cost-optimized for the Malaysian market, intentionally portable (no proprietary lock-in).

Two productive surfaces:
- **GM** at `/games/[id]` → Setup, Review, Leaderboard tabs
- **Player** at `/play/[code]` → Missions, Leaderboard tabs

Plus auth surfaces (`/login`, `/signup`) and a guest path (anonymous Supabase auth, no signup needed).

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js 16** (App Router, Turbopack default) | This is *not* the Next.js most LLMs know — see §6 for the breaking changes that bit us |
| UI | **React 19** + **Tailwind v4** | Tailwind v4 uses `@import "tailwindcss"` + `@theme inline` in `globals.css`, no `tailwind.config.ts` |
| Backend | **Next.js Server Actions** | Single deployable, server actions for all mutations |
| Database | **Supabase local** (Postgres 17) via Docker | Ports remapped to 64xxx (see §6) |
| Auth | **Supabase Auth** (email + password + anonymous) | Anonymous sign-ins enabled in `config.toml` |
| Realtime | **Supabase Realtime** (`postgres_changes`) | Live leaderboard, live notifications |
| File storage | **Supabase Storage** | Private `submissions` bucket; signed URLs (1h TTL) for all reads |
| Drag-and-drop | **@dnd-kit/sortable** | For mission reorder |
| Mission unlock model | **DNF (disjunctive normal form)** in `unlock_groups jsonb` + optional `unlock_after timestamptz` | Stored as `string[][]`; any group satisfies. Time gate independent of groups. |
| Notifications | **In-app realtime** via DB triggers + `notifications` table + `<NotificationBell>` | Web push not wired yet — see §10 |

**Production caveat:** server actions on Vercel free tier cap at ~4.5 MB. Current `bodySizeLimit: "110mb"` works on a server you control (VPS, self-hosted). For Vercel deployment, switch to **direct-to-Supabase-Storage uploads via signed upload URLs** (browser writes straight to storage; server action only records the path).

---

## 3. Running locally

### Prerequisites
- **Node.js ≥ 20** (we're on v24)
- **Docker Desktop** running — must be alive for Supabase containers
- **npm**

### First time / after a clean checkout
```bash
cd "C:/Users/alexl/Escape Room Mission Webbased/escape-room"
npm install
npx supabase start          # pulls images on first run (~1 GB)
npx supabase db reset       # applies all migrations
npm run dev
```

### Normal startup (after a reboot)
1. **Open Docker Desktop**, wait for whale icon ✅
2. Supabase containers auto-restart with the daemon — no `supabase start` needed if they were already provisioned
3. `npm run dev` from `escape-room/`
4. Visit http://localhost:3000

### Service map
| Service | URL | Port |
|---|---|---|
| Next.js | http://localhost:3000 | 3000 |
| Supabase API (Kong) | http://localhost:64321 | 64321 |
| Postgres | `postgresql://postgres:postgres@localhost:64322/postgres` | 64322 |
| Supabase Studio | http://localhost:64323 | 64323 |
| Inbucket (test email) | http://localhost:64324 | 64324 |

---

## 4. Project structure

```
Escape Room Mission Webbased/         ← parent folder (just contains the repo)
└── escape-room/                      ← git repo, Next.js app root
    ├── PRD.md                        ← product spec (canonical)
    ├── HANDOFF.md                    ← this file
    ├── README.md                     ← run instructions
    ├── AGENTS.md                     ← "this is NOT the Next.js you know" note
    ├── next.config.ts                ← serverActions.bodySizeLimit = 110mb
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx                          # home
    │   │   ├── login/, signup/, logout/          # auth
    │   │   ├── games/
    │   │   │   ├── page.tsx                      # GM: list my games
    │   │   │   ├── new/page.tsx                  # GM: create game
    │   │   │   └── [id]/
    │   │   │       ├── page.tsx                  # Setup tab
    │   │   │       ├── review/page.tsx           # Review tab
    │   │   │       ├── leaderboard/page.tsx      # Leaderboard tab
    │   │   │       └── missions/
    │   │   │           ├── new/page.tsx
    │   │   │           └── [missionId]/edit/page.tsx
    │   │   └── play/
    │   │       ├── page.tsx                      # enter code (or sign in as guest)
    │   │       └── [code]/
    │   │           ├── page.tsx                  # team picker + Missions tab
    │   │           ├── leaderboard/page.tsx      # Leaderboard tab
    │   │           └── m/[missionId]/page.tsx    # submit
    │   ├── components/
    │   │   ├── Header.tsx                        # nav + bell + logout
    │   │   ├── TabNav.tsx                        # shared Setup/Review/Leaderboard nav
    │   │   ├── NotificationBell.tsx              # live bell + dropdown
    │   │   ├── MissionForm.tsx                   # shared create/edit form
    │   │   ├── MissionInspector.tsx              # click-to-inspect popup on Review
    │   │   ├── UnlockEditor.tsx                  # DNF unlock builder + time gate
    │   │   ├── ReferenceLinksEditor.tsx          # add/remove URL rows
    │   │   ├── SortableMissionList.tsx           # drag-and-drop mission list
    │   │   ├── MediaUploadField.tsx              # styled photo/video drop zone
    │   │   ├── Countdown.tsx                     # live timer for deadlines
    │   │   └── Leaderboard.tsx                   # live aggregate-score table
    │   ├── lib/
    │   │   ├── auth-actions.ts                   # login / signup / signInAsGuest / logout
    │   │   ├── gm-actions.ts                     # all GM-side mutations
    │   │   ├── player-actions.ts                 # joinTeam / submit*
    │   │   ├── notification-actions.ts           # markRead / markAllRead
    │   │   └── supabase/
    │   │       ├── client.ts                     # browser client
    │   │       ├── server.ts                     # server client (await cookies)
    │   │       ├── proxy.ts                      # session refresh helper
    │   │       └── database.types.ts             # generated from schema
    │   └── proxy.ts                              # Next 16 middleware (renamed)
    ├── supabase/
    │   ├── config.toml                           # 64xxx ports + anonymous sign-ins on
    │   └── migrations/                           # 11 migrations, see §7
    └── .env.local                                # local Supabase keys (gitignored)
```

---

## 5. Architectural decisions worth knowing

### 5.1 Unlock model is DNF, not a tree
A mission's unlock spec is `unlock_groups: string[][]` (array of AND groups; ANY group satisfies) plus an independent optional time gate `unlock_after: timestamptz`. Any boolean unlock expression you'd want (`(M1 AND M2) OR M3 AFTER 14:00`) flattens to this shape. SQL evaluation lives in `recompute_team_mission_state()`.

### 5.2 Deadlines have three modes
- `absolute` — fixed wall-clock time (`deadline_at`)
- `relative_to_unlock` — `deadline_duration_sec` after *this team* unlocks (fairest)
- `relative_to_game_start` — `deadline_duration_sec` after game's `starts_at` (synchronized)

The recompute function computes `expires_at` on the locked→unlocked transition and **preserves it once set** — so a mid-game deadline edit doesn't shorten an already-running timer.

### 5.3 State refresh is lazy, not background
Two SQL functions sweep state:
- `expire_overdue_missions_for_team/_for_game` — flips overdue unlocked → failed_expired
- `recompute_team_mission_state(team_id)` — applies time gates + DNF unlock evaluation

Called from page reads on player + GM pages so time gates and deadlines fire on the next visit, **not on a cron**. Adding push notifications properly will require a `pg_cron` job (every 30s) so events fire even when no one's looking.

### 5.4 Notifications are in-app first, web-push-ready
DB triggers (`on_tms_change`, `on_submission_notify`) write rows to a `notifications` table. The `<NotificationBell>` subscribes via Supabase Realtime. **Hooking up Web Push later is purely additive** — a worker watches the same realtime channel and calls the web-push service for any subscribed users.

### 5.5 Guests are real auth users
Anonymous Supabase auth is enabled in `config.toml`. Guests are real `auth.users` rows with `is_anonymous = true` and no email. All existing RLS policies and FKs work unchanged. Guest hosting is blocked at both the action (`createGame`) and the policy level (`can_host_games()` SECURITY DEFINER fn checks `is_anonymous`).

### 5.6 Reference image + reference links live on the mission
`reference_image_path` (single image, stored in the `submissions` bucket under `mission-media/...`) and `reference_links` (`jsonb` array of `{label, url}`, capped at 10, http/https only). Both show up on the player submit page and in the GM's `<MissionInspector>` popup.

### 5.7 Server actions own all writes
No REST/route handlers for mutations. Every change happens through a server action in `src/lib/*-actions.ts`, which redirects after revalidating. Forms use server actions directly via `action={someAction}`.

---

## 6. Gotchas that bit us (don't relearn these)

### Next.js 16 breaking changes
- **`cookies()`, `headers()`, `params`, `searchParams` are all async** — must `await`. The server Supabase client does `await cookies()`.
- **`middleware.ts` renamed to `proxy.ts`**, function is `proxy()` not `middleware()`. Lives at `src/proxy.ts`.
- **`next lint` removed** — use `eslint` directly.
- **Turbopack is default** — no `--turbopack` flag.
- **Page props use `PageProps<"/route/path">` helper** — generated via `npx next typegen`.
- **`encType` is automatically derived** when `action` is a server function — don't set it manually or you get a console warning.

### Windows + Docker Desktop quirks
- **Hyper-V port reservations** can claim arbitrary ports in the 53xxx–54xxx range, so Supabase ports were remapped to **64xxx**. If you ever see `bind: An attempt was made to access a socket in a way forbidden`, check `netsh int ipv4 show excludedportrange protocol=tcp` and bump the affected port further.
- **Closing Docker Desktop's window does NOT stop the daemon** (it minimizes to tray). *Quitting* via right-click → "Quit Docker Desktop" stops it.
- **Docker daemon stopping kills Supabase but containers auto-restart** when Docker comes back — volumes persist. Next.js dev server may crash though; just `npm run dev` again.
- **WSL/Windows bash networking** can be flaky for `curl localhost` from inside this shell — pages still serve fine to the browser. Don't panic if curl returns `000`.

### Server-action body size
- Default Next.js 16 limit is **1 MB** — anything bigger 413s. Bumped to **110 MB** in `next.config.ts` for video uploads. **Vercel free tier caps around 4.5 MB regardless**, so for production deployment switch to direct-to-storage uploads.

### Realtime + RLS interaction
- A user only receives realtime events for rows they can `SELECT` via RLS. We loosened `team_mission_state` SELECT to same-game teammates so the leaderboard updates live for everyone.
- Tables must be **explicitly added to the `supabase_realtime` publication** to emit events. Migrations include `alter publication supabase_realtime add table …`.

### TypeScript narrowing
- Generated DB types widen enum-like text columns to plain `string` and `jsonb` columns to `Json`. Cast at the boundary (`as MissionInitial["submission_type"]`, `as string[][]`).

---

## 7. Migration history

| File | What it does |
|---|---|
| `20260505000000_init.sql` | Phase 1: profiles, games, teams, team_members, missions, submissions, team_mission_state. RLS for everything. Trigger to auto-create profile on signup. |
| `20260505000001_deadlines.sql` | Mission `deadline_{mode,at,duration_sec}` + tms `expires_at` + `failed_expired` state + lazy expiry RPCs. |
| `20260506000000_assignments_video_refmedia.sql` | `mission_team_assignments` + `assignment_mode` + video submission type + `reference_image_path`. |
| `20260506000001_realtime_and_passwords.sql` | Team passwords (bcrypt) + `requires_password` generated column + `game_leaderboard` RPC + tms in realtime publication. |
| `20260506000003_bonus_and_review.sql` | `submissions.bonus_points` mirrored to tms; leaderboard sums base + bonus. |
| `20260506000004_guests_and_reset.sql` | Hardened `handle_new_user` for anonymous users (fallback to "Guest") + submissions DELETE policy. |
| `20260506000005_block_guest_hosting.sql` | `can_host_games()` SECURITY DEFINER fn; games_insert_owner policy uses it. Extension point for future GM verification. |
| `20260506000006_reorder_missions.sql` | Atomic `reorder_missions(p_game_id, p_ids[])` RPC for drag-and-drop. |
| `20260506000007_branching_unlock.sql` | Replaces `prerequisite_mission_id` with `unlock_groups jsonb` + `unlock_after timestamptz`. Rewrites recompute fn for DNF + time gates. Adds `refresh_game_state` wrapper. |
| `20260506000008_notifications.sql` | `notifications` table + RLS + `on_tms_change` + `on_submission_notify` triggers + realtime publication. |
| `20260506000009_reference_links.sql` | `missions.reference_links jsonb` (array of `{label, url}`). |

---

## 8. PRD progress

See [`PRD.md`](./PRD.md) for the full spec. Status against §8 phased rollout:

### ✅ Phase 1 (complete)
Auth · games · teams · text+photo missions · linear prerequisites · player submission · GM judging · basic leaderboard · all-teams assignment.

### Phase 2 (mostly complete)
| Item | Status |
|---|---|
| Video submissions | ✅ |
| Per-team mission assignment | ✅ |
| Time-sensitive missions + countdown UI | ✅ |
| Branching/boolean unlock + time gates | ✅ |
| In-app notifications (foundation for web push) | ✅ |
| **GPS check-in submissions** | ❌ |
| **Web push proper (service worker + VAPID)** | ❌ (in-app notifications written; SW + push subscription remains) |
| **Background cron** for time gates / expiry | ❌ (lazy-on-read only) |

### Phase 3 (partial)
| Item | Status |
|---|---|
| Live realtime leaderboard | ✅ |
| **CSV export** | ❌ |
| **Game cloning** | ❌ |
| **PWA polish** (manifest + service worker + install prompt) | ❌ |
| **i18n** (EN + BM) | ❌ |
| Accessibility | ⚠️ Partial — keyboard works on key surfaces (DnD has full a11y), no formal audit |

### Extras beyond PRD
Mission **edit** page · Mission **drag-and-drop reorder** · Guest joins + guest hosting block · Per-team join **passwords** · Click-to-inspect mission **popup** · Bonus points + tabbed review · Discard rejected submissions · GM **verification** extension point (`can_host_games()` ready) · Mission **reference links**.

### Still in PRD §5 not yet built
- Game settings UI for start/end times, status (draft/active/ended pause/resume), team size limits, max teams, invite-only flag
- Team captain role + shareable team-invite links
- Team emblem/avatar (only color today)
- Per-team submission feed for the team to see their own history
- Per-team progress map view for the GM (locked/unlocked/completed grid)
- Submission filter by team / mission (only status tabs today)

### §6 non-functional / production
- **Cloudflare R2** for media (currently Supabase Storage — fine for dev)
- **Image processing** (EXIF strip, thumbnails)
- **Direct-to-storage upload** (required for Vercel deployment)
- **Video duration enforcement** (60s max — size capped, duration unchecked)
- Never load-tested at the 1000-concurrent target

---

## 9. Commits (newest first)

```
a3def79  In-app realtime notifications + mission reference links
b4915e0  Branching boolean unlock expressions + time gates
40a83ab  Fix MP4 upload: bump server-action body limit + drop redundant encType
e756f1c  Drag-and-drop mission reorder + fix MissionInspector dark-mode text
24dafd5  Add edit page for existing missions
ba070a9  Add click-to-inspect mission popup on the review page
2a778b8  Move leaderboard to its own tab; block guests from hosting
8f82116  Split GM dashboard into Setup and Review routes
b365810  Add guest joins, submitter names, and Discard for rejected submissions
ccded5a  Add bonus points and tabbed review section
6c9e92b  Style media submission as a proper drop-zone field
94760c4  Add realtime leaderboard and per-team join passwords
88b91c9  Add per-team assignment, video submissions, mission reference images
c31fc17  Add time-sensitive missions with three deadline modes
b07cb63  Implement Phase 1 prototype: auth, GM and player flows
d1350dd  Initial commit from Create Next App
```

Each commit is a self-contained change with a detailed message — `git show <sha>` for context.

---

## 10. Suggested next steps (pick one)

In rough order of impact-per-effort:

1. **Game settings UI** *(small, fixes a real gap)* — start/end times, pause/resume button, team-size limits, max-teams cap. Schema already has the columns.
2. **GPS check-in submissions** *(completes PRD §5.3 submission types)* — reuse auto-validation pattern; Haversine in SQL is ~10 lines. UI is a "Use my location" button + lat/lng inputs.
3. **CSV export** of leaderboard + submissions *(small, high practical value)* — server action returns a CSV `Response`.
4. **Game cloning** *(very small)* — duplicate missions on insert; no team assignment carryover.
5. **Direct-to-storage upload via signed URLs** *(unlocks Vercel deployment)* — server action issues a signed PUT URL; browser uploads; client posts the resulting path to a tiny `recordSubmission` action.
6. **PWA polish** *(small to start)* — manifest.json + minimal service worker + install prompt. Makes "add to home screen" work on mobile.
7. **Web push proper** *(builds on the notification foundation)* — VAPID keys + service worker push handler + `push_subscriptions` table + a worker that reads new `notifications` rows. Schema and triggers are already wired.
8. **`pg_cron` worker** *(needed before push for time-gate / expiry notifications to fire when no one's on the page)* — every 30s call `refresh_game_state` for every active game. Supabase supports `pg_cron`.
9. **Per-team progress map** for GM live dashboard *(small feature, high event-time value)* — grid of teams × missions with locked/unlocked/completed/failed cells.
10. **i18n** (BM + EN) *(mechanical, medium effort)*.

---

## 11. How to start a new conversation

Two ways to get a fresh context window while staying on the same project:

### Option A — `/clear` in the same Claude Code session *(recommended)*
Keeps your terminal, working directory, and CLI session; wipes the conversation history. Steps:

1. In the Claude Code prompt, type `/clear` and hit enter.
2. Once the context is cleared, paste:
   > Read HANDOFF.md and PRD.md. I want to work on **[item #N from §10, or something else]**.

That's it — the new conversation has full context via the two docs and continues editing this repo.

### Option B — fully new session
Close Claude Code, then in a fresh terminal:

```bash
cd "C:/Users/alexl/Escape Room Mission Webbased/escape-room"
claude
```

Then the same prompt:
> Read HANDOFF.md and PRD.md. I want to work on **[…]**.

### Quick orientation
If you don't want to read both docs end-to-end, this works too:
> Read HANDOFF.md. Where are we right now?

### When to clear vs. continue
- **Clear** if the current conversation is long, the topic is shifting, or you want a clean slate.
- **Don't clear** if you're mid-task and just need to step away — Claude Code remembers across pauses, so picking up later in the same conversation works fine.

---

## 12. Common commands cheat sheet

```bash
# Dev
npm run dev                                   # start Next.js on :3000

# Type checks
npx tsc --noEmit                              # type check the whole project
npx next typegen                              # regen route types after adding/renaming routes

# Supabase
npx supabase start                            # start the local stack (idempotent)
npx supabase stop                             # stop containers (volumes persist)
npx supabase status                           # show service URLs and keys
npx supabase db reset                         # wipe + reapply all migrations
npx supabase gen types typescript --local \
  > src/lib/supabase/database.types.ts        # regen TS types after schema changes

# Git
git log --oneline                             # see commit history
git show <sha>                                # see details of a specific commit

# Direct Postgres access (sanity checks)
docker exec supabase_db_escape-room psql -U postgres -c "<SQL>"
```

---

## 13. Known issues / paper cuts

- **Reference image upload uses the bare browser file input** in `MissionForm.tsx` (only the player submit page got the styled `<MediaUploadField>`). Same component would slot in cleanly — small follow-up.
- **`supabase_vector` container restart-loops** harmlessly — it's the analytics sidecar, not used by the app.
- **Lazy state refresh** means time-gate unlocks and deadline expirations don't fire notifications until *someone visits a page that calls the lazy sweep*. Background cron (item #8 above) fixes this.
- **No mission delete confirmation** — single click on Delete drops the row. Easy to add a confirm dialog if needed.
- **CRLF/LF git warnings** on every commit are noise (Windows line endings). Not a problem; `core.autocrlf=true` would silence them if it bothers you.
