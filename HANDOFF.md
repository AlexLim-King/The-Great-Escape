# Project Handoff — Escape Room Mission Platform

**Last updated:** 2026-05-24
**Status:** Working local prototype. Phase 1 + most of Phase 2 from `PRD.md` is done, plus a GM/management cluster (see §0). A few items remain (§10).

> ⚠️ **The 2026-05-24 GM/management work (see §0) is on the working tree but not yet committed.** The prior session is committed (`7c31b43`). `git status` will show the new/modified files below. Commit when you're happy with it.

This document is for **resuming work in a fresh conversation**. Read this plus [`PRD.md`](./PRD.md) and you have the full picture.

---

## 0. Latest session (2026-05-24) — GM / management cluster

Three GM dashboard features, all typechecked, lint-clean, and covered by a new E2E spec (`gm-management.spec.ts`, §14):

- **Per-team progress map.** New `/games/[id]/progress` tab — a missions × teams grid. Each cell shows that team's `team_mission_state` (locked / unlocked / pending-review / completed / expired) as a color-tinted pill, plus a synthetic "not assigned" for specific-assignment missions a team isn't on. Sticky mission column + team header (with a per-team completed/assigned tally); mission rows link to the per-mission review page. Reads `team_mission_state` directly — RLS already lets the owning GM read every team's rows (the `tms_select` policy's owner branch). Server component, no new SQL.
- **CSV + media export.** New GET route handler `/games/[id]/export?type=submissions|leaderboard|media` (owner-checked). The two CSVs return a `text/csv` download (BOM + CRLF for Excel): `submissions` = one row per submission (mission, team, status, type, points, bonus, submitter, timestamps, answer/text, media path, feedback); `leaderboard` = the `game_leaderboard` RPC flattened to rank/team/score/completed. **`type=media`** returns a **streamed ZIP** of every photo/video submission, organized into one folder per team with files named `<Team> - <Mission>.ext` (collisions get ` (2)`, ` (3)`…). Built with **`archiver`** in `store` mode (media is already compressed) piped through a `PassThrough` → web `ReadableStream`, and files are downloaded from Storage + appended one at a time, so a big video set never has to fit in memory at once. Download links: "↓ Export CSV" + "↓ Download media (N)" on the Review header (the media link is gated on `mediaCount > 0`), "↓ Export leaderboard CSV" on the Leaderboard tab. **This is the only route handler in the app** — chosen over a server action because file downloads need a `Response` (see §5.7 note). Covered by `media-export.spec.ts`.
- **Filter submissions by team.** The Review **By Status** queue now has a team-pill filter row (`?team=<id>`). Combines with the status tab; sub-tab counts (`statusCounts`) re-scope to the selected team, while the TabNav/toggle badge stays global. The filter is threaded into the judging return path so approving/rejecting keeps you on the filtered view.
- **Shared `gmTabs()` helper.** `src/lib/gm-tabs.ts` centralizes the GM tab set (Setup / Review / Leaderboard / **Progress** / Settings) that was duplicated across 5 pages — adding the Progress tab was then a one-line change everywhere.

Plus follow-ups in the same session:

- **"Treasure Hunt" player theme** (pirate / beach) — a third per-game theme alongside `default` and `matrix`. Warm parchment/sand surfaces, lagoon-teal + doubloon-gold accents, sepia ink, an old-map **serif** face, a sun-glow vignette, and **drifting ocean waves** along the bottom (`<TreasureBackdrop>` — pure CSS, two data-URI SVG wave bands, no canvas/JS, respects `prefers-reduced-motion`). Wiring is the same five-touch recipe as Matrix: `[data-theme="treasure"]` block in `globals.css`, settings `<option>`, `'treasure'` in `GAME_THEMES` (server validation) + the `games.theme` check constraint (migration `…015`), and `play/[code]/layout.tsx` mounts the backdrop. Covered by `game-theme.spec.ts`.
- **Cover-image guidance.** Settings now recommends an optimal mobile cover size (landscape **16:9, ~1200×675 px**) in the hint, and the preview thumbnail uses a 16:9 (`aspect-video`) frame to match.
- **Light / Dark / System mode toggle.** Dark mode used to follow the OS automatically (`@media (prefers-color-scheme: dark)`), so there was no way to force light on a dark-set laptop. It's now **opt-in via `data-color-scheme` on `<html>`**: `globals.css` keeps light in `:root` and applies dark only under `:root[data-color-scheme="dark"]` (no media query). A **`<ThemeToggle>`** in the header cycles Light → Dark → System (persisted in `localStorage['theme-pref']`), and a tiny **pre-paint inline script** in `layout.tsx` resolves the saved choice (default **light**, "system" resolved against the OS) before first paint so there's no flash; `<html>` carries `suppressHydrationWarning`. Default is now light even when the OS prefers dark — the requested behavior for presentations. **Per-game player themes (matrix/treasure) are unaffected** — their `[data-theme]` wrappers override the tokens regardless of light/dark. Covered by `theme-toggle.spec.ts`.

---

## 0b. Prior session (2026-05-23) — earlier feature/polish pass

A large feature + polish pass. All of this is implemented, typechecked, lint-clean, and covered by an E2E suite (§14):

- **GM announcements → all teams.** New `broadcast_announcement` + `list_game_announcements` RPCs (migration `…010`), an `<AnnouncementComposer>` at the top of the Review page, and a per-player **notifications history page** at `/play/[code]/notifications` (plus a "Notifications" tab on the player surface). New `gm_announcement` notification type.
- **Mission-centric review.** The Review tab now toggles **By Mission** (a gallery grid of mission cards with representative thumbnail, points, submission count, "to review" badge) ↔ **By Status** (the original pending/approved/rejected queue). Clicking a mission card opens `/games/[id]/review/m/[missionId]` — a per-mission comparison page with the **requirements pinned at the top** and every team's submission below, each with full judging controls. This delivered the PRD "filter submissions by mission" item.
- **Batch mission upload.** `/games/[id]/missions/batch` — select a set of images; each becomes a GM-judged mission titled from its filename with the picture as reference. Images upload **browser-direct-to-Supabase-Storage** (bypasses the server-action body limit), then `createMissionsBatch` inserts the rows. Additive multi-select with dedupe.
- **Editorial-Modern theme system.** `globals.css` is now a CSS-variable token system (surfaces/text/borders/accent/status + shadows + gradient) mapped through `@theme inline`, with `@layer components` helpers (`.btn`, `.input`, `.card`, `.pill`, `.banner`, `.text-gradient`). Light + dark via `prefers-color-scheme`. To add a theme later: override the vars under `[data-theme="x"]`. Geist font now actually applies (was overridden by Arial).
- **Forms preserve input on error.** login/signup/play-join/create-game/create-team converted to the `useActionState` pattern (return `{error, values}` instead of `redirect(?error=)`); MissionForm uses client-side gating. Convention documented in `AGENTS.md`.
- **Default teams.** New games are seeded with Team 1–4.
- **Game settings & lifecycle.** New `/games/[id]/settings` tab: edit name/description/end-time (`updateGameSettings`, useActionState) + status control draft → active → paused ⇄ active → ended (`setGameStatus`, migration `…011` adds `paused`). Player submissions are gated on `status === 'active'` (enforced in `ensureMissionSubmittable` + submit page guard + a banner on the play page).
- **Start scheduling (relative + absolute).** "Start now", or schedule via `<StartScheduler>` — a radio toggle between "in N minutes/hours/days" and "at a set wall-clock time" (`scheduleGameStart` accepts either `amount`+`unit` or an absolute `starts_at`; `cancelGameStart` clears). Scheduled games **auto-start lazily** via `refresh_game_status(game_id)` RPC (migration `…012`) — flips draft→active on the next read once `starts_at` passes (no cron, mirrors the tms refresh pattern). Players see a live `<GameStartCountdown>` that `router.refresh()`es itself to live at zero. **New games now default to `draft`** (was `active`) so they can be started/scheduled — players join while draft but can't submit.
- **Per-game player themes.** GM picks a theme in settings (`theme` column, migration `…013`); the player surface renders in it. Default = Editorial; **Matrix** = green-on-black CLI/CRT (monospace, phosphor glow, scanlines, digital-rain canvas). Applied FOUC-free via a server-rendered `play/[code]/layout.tsx` wrapper that sets `data-theme` (the global header stays default). New themes = a `[data-theme="x"]` block in `globals.css` + the settings select.
- **Game intro details.** Settings now has a **cover image** (`games.image_path`, `setGameImage` upload/replace/remove, stored under `game-media/...`) and an optional **location** (`games.location` text), plus **char limits/counters** on name (60) and description (200) — migration `…014`. Cover + location show to players on the `/play/[code]` join/intro screen. (Game-level password + search-visibility were intentionally skipped — team passwords already gate, and there's no public discovery.)
- **Playwright E2E suite** (`e2e/`) — see §14.

---

## 1. TL;DR — what this is

A Goosechase-style scavenger-hunt platform where a **game master (GM)** designs missions with branching unlock graphs and **teams of players** complete them by submitting text / photo / video. Built as a mobile-first web app, cost-optimized for the Malaysian market, intentionally portable (no proprietary lock-in).

Two productive surfaces:
- **GM** at `/games/[id]` → Setup, Review (By Mission / By Status), Leaderboard tabs. Setup has "Batch upload" + "+ Add mission". Review has the announcement composer.
- **Player** at `/play/[code]` → Missions, Leaderboard, Notifications tabs

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
| ZIP export | **archiver** (`store` mode, streamed) | Bulk media download (`/export?type=media`) — per-team folders |
| Mission unlock model | **DNF (disjunctive normal form)** in `unlock_groups jsonb` + optional `unlock_after timestamptz` | Stored as `string[][]`; any group satisfies. Time gate independent of groups. |
| Notifications | **In-app realtime** via DB triggers + `notifications` table + `<NotificationBell>` | Includes **GM announcements** (broadcast to all teams) + a per-game player history page. Web push still not wired — see §10 |
| Styling | **Token-based theme** (CSS vars + `@theme inline` + `@layer components`) | "Editorial Modern" default; light/dark via `prefers-color-scheme`. See §5.8 |
| Testing | **Playwright** E2E (`e2e/`) | `npm run test:e2e`. Runs against the dev server + local Supabase. See §14 |
| Forms | **`useActionState`** for fallible forms | Return `{error, values}` instead of redirecting, so input survives errors. See `AGENTS.md` |

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
    │   │   │       ├── page.tsx                  # Setup tab (AddTeamForm + batch link)
    │   │   │       ├── review/page.tsx           # Review tab — By Mission / By Status
    │   │   │       ├── review/m/[missionId]/page.tsx  # per-mission comparison + judging
    │   │   │       ├── leaderboard/page.tsx      # Leaderboard tab (+ CSV export link)
    │   │   │       ├── progress/page.tsx         # Progress tab — per-team missions×teams grid
    │   │   │       ├── export/route.ts           # GET CSV export (submissions | leaderboard)
    │   │   │       ├── settings/page.tsx         # Settings tab (lifecycle, theme, intro)
    │   │   │       └── missions/
    │   │   │           ├── new/page.tsx
    │   │   │           ├── batch/page.tsx        # batch image → missions upload
    │   │   │           └── [missionId]/edit/page.tsx
    │   │   └── play/
    │   │       ├── page.tsx                      # enter code (renders <JoinGameForm>)
    │   │       └── [code]/
    │   │           ├── page.tsx                  # team picker + Missions tab
    │   │           ├── leaderboard/page.tsx      # Leaderboard tab
    │   │           ├── notifications/page.tsx    # player notification history
    │   │           └── m/[missionId]/page.tsx    # submit
    │   ├── components/
    │   │   ├── Header.tsx                        # nav + bell + logout + accent stripe
    │   │   ├── TabNav.tsx                        # shared tab nav
    │   │   ├── NotificationBell.tsx              # live bell + dropdown
    │   │   ├── PlayerNotificationsList.tsx       # client list for the history page
    │   │   ├── AnnouncementComposer.tsx          # GM broadcast composer (Review)
    │   │   ├── MissionForm.tsx                   # shared create/edit form
    │   │   ├── MissionInspector.tsx              # click-to-inspect popup (By Status)
    │   │   ├── MissionRequirements.tsx           # pinned requirements panel (per-mission)
    │   │   ├── SubmissionReviewCard.tsx          # one submission + judging (both review views)
    │   │   ├── BatchMissionUpload.tsx            # batch image picker + uploader
    │   │   ├── LoginForm.tsx / SignupForm.tsx / JoinGameForm.tsx  # useActionState forms
    │   │   ├── NewGameForm.tsx / AddTeamForm.tsx # useActionState forms
    │   │   ├── UnlockEditor.tsx                  # DNF unlock builder + time gate
    │   │   ├── ReferenceLinksEditor.tsx          # add/remove URL rows
    │   │   ├── SortableMissionList.tsx           # drag-and-drop mission list
    │   │   ├── MediaUploadField.tsx              # styled photo/video drop zone
    │   │   ├── Countdown.tsx                     # live timer for deadlines
    │   │   └── Leaderboard.tsx                   # live aggregate-score table
    │   ├── lib/
    │   │   ├── gm-tabs.ts                        # shared GM tab set (Setup/Review/Leaderboard/Progress/Settings)
    │   │   ├── auth-actions.ts                   # login / signup / joinGame / logout (useActionState)
    │   │   ├── gm-actions.ts                     # all GM mutations incl. createMissionsBatch, broadcastAnnouncement
    │   │   ├── player-actions.ts                 # joinTeam / submit*
    │   │   ├── notification-actions.ts           # markRead / markAllRead
    │   │   └── supabase/
    │   │       ├── client.ts                     # browser client
    │   │       ├── server.ts                     # server client (await cookies)
    │   │       ├── proxy.ts                      # session refresh helper
    │   │       └── database.types.ts             # generated from schema
    │   └── proxy.ts                              # Next 16 middleware (renamed)
    ├── e2e/                                      # Playwright specs + helpers (see §14)
    ├── playwright.config.ts
    ├── supabase/
    │   ├── config.toml                           # 64xxx ports + anonymous sign-ins on
    │   └── migrations/                           # 12 migrations, see §7
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
DB triggers (`on_tms_change`, `on_submission_notify`) write rows to a `notifications` table. The `<NotificationBell>` subscribes via Supabase Realtime. **GM announcements** fan out one `gm_announcement` row per current team member via the SECURITY DEFINER `broadcast_announcement` RPC (so the bell/RLS/realtime path is reused unchanged); `list_game_announcements` dedupes them back into one row per broadcast for the GM's history panel. **Hooking up Web Push later is purely additive** — a worker watches the same realtime channel and calls the web-push service for any subscribed users.

### 5.5 Guests are real auth users
Anonymous Supabase auth is enabled in `config.toml`. Guests are real `auth.users` rows with `is_anonymous = true` and no email. All existing RLS policies and FKs work unchanged. Guest hosting is blocked at both the action (`createGame`) and the policy level (`can_host_games()` SECURITY DEFINER fn checks `is_anonymous`).

### 5.6 Reference image + reference links live on the mission
`reference_image_path` (single image, stored in the `submissions` bucket under `mission-media/...`) and `reference_links` (`jsonb` array of `{label, url}`, capped at 10, http/https only). Both show up on the player submit page and in the GM's `<MissionInspector>` popup.

### 5.7 Server actions own all writes
No REST/route handlers for mutations. Every change happens through a server action in `src/lib/*-actions.ts`. Two patterns coexist: simple/always-succeeding actions redirect after revalidating (`action={someAction}`); fallible forms use the `useActionState` pattern below. **The one route handler is `games/[id]/export/route.ts`** — a GET-only file download (CSV), which a server action can't do (it needs to return a `Response`/stream). It's still owner-checked and read-only, so the "actions own all writes" rule holds.

### 5.8 Theme tokens (Editorial Modern)
`globals.css` defines all colors/shadows/radii as CSS variables under `:root` (light) + a `prefers-color-scheme: dark` block, exposed as Tailwind utilities via `@theme inline` (e.g. `bg-surface`, `text-muted`, `border-default`, `text-accent`, `pill-success`). Reusable component classes live in `@layer components` (`.btn{,-primary,-secondary,-ghost,-danger}`, `.input/.textarea/.select`, `.card{,-compact,-interactive}`, `.pill{,-success,...}`, `.banner{,-error,...}`, `.text-gradient`, `.accent-rule`). **Never hardcode colors in components** — use the token utilities or these classes. A new theme = override the vars under `[data-theme="name"]` and set the attribute on a wrapper/element; no component changes. **Live example:** the `matrix` theme (`[data-theme="matrix"]` in `globals.css`) is applied per-game by `play/[code]/layout.tsx` (reads `games.theme`, wraps the player surface in `<div data-theme>` + a `<MatrixRain>` canvas). GM picks it in settings.

### 5.9 Fallible forms preserve input (useActionState)
Forms that can fail validation/server checks must **not** `redirect("?error=…")` (it wipes uncontrolled inputs). Instead the action is `(prevState, formData) => Promise<{error?, values?}>`; on error it returns the message + the user's input (never secrets), on success it redirects. The form is a client component using `useActionState`, seeding inputs from `state.values` via `defaultValue`. Reference impls: `login`/`signup`/`joinGame` + `LoginForm`/`SignupForm`/`JoinGameForm`; `createGame`/`createTeam` + `NewGameForm`/`AddTeamForm`. Full convention in `AGENTS.md`.

### 5.10 Direct-to-storage upload (batch only, so far)
`BatchMissionUpload` uploads each image straight from the browser to the `submissions` bucket via the authenticated browser client, then calls `createMissionsBatch(gameId, items[])` with just the resulting paths — sidestepping the server-action body-size limit. This is the pattern the rest of the upload paths (player submissions, single-mission reference) should eventually adopt for Vercel. Storage RLS is permissive (`bucket_id = 'submissions'`), so the same identity works browser- or server-side.

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
| `20260506000010_gm_announcements.sql` | Adds `gm_announcement` to the notifications type check + `broadcast_announcement(game_id,title,body)` and `list_game_announcements(game_id,limit)` SECURITY DEFINER RPCs (owner-checked). |
| `20260506000011_game_status_paused.sql` | Adds `'paused'` to the `games.status` check constraint (draft/active/paused/ended) for the lifecycle controls. |
| `20260506000012_game_auto_start.sql` | `refresh_game_status(game_id) returns text` SECURITY DEFINER — lazily flips a scheduled (draft + due `starts_at`) game to `active` on read; returns the current status. |
| `20260506000013_game_theme.sql` | `games.theme` column (`'default'`/`'matrix'`) — the per-game player theme. |
| `20260506000014_game_intro.sql` | `games.image_path` (cover image) + `games.location` (free text) for the player intro screen. |
| `20260506000015_game_theme_treasure.sql` | Widens the `games.theme` check constraint to allow `'treasure'` (pirate/beach player theme), alongside `'default'` and `'matrix'`. |

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
| **CSV export** | ✅ (submissions + leaderboard, route handler) |
| **Game cloning** | ❌ |
| **PWA polish** (manifest + service worker + install prompt) | ❌ |
| **i18n** (EN + BM) | ❌ |
| Accessibility | ⚠️ Improved (visible focus rings, token contrast, DnD a11y) — still no formal audit |
| Visual polish / theming | ✅ Token-based theme system, light+dark (§5.8) |

### Extras beyond PRD
Mission **edit** page · Mission **drag-and-drop reorder** · Guest joins + guest hosting block · Per-team join **passwords** · Click-to-inspect mission **popup** · Bonus points + tabbed review · Discard rejected submissions · GM **verification** extension point (`can_host_games()` ready) · Mission **reference links** · **GM announcements** + player notification history · **Mission-centric review** (By Mission gallery + per-mission comparison) · **Batch mission upload** · **Default Team 1–4** on game create · **Form input preservation** (useActionState) · **Playwright E2E suite**.

### Still in PRD §5 not yet built
- Game settings UI: **✅ name/description/schedule + status lifecycle (draft/active/paused/ended) with player-side gating** (`/games/[id]/settings`). Still **❌ team-size limits, max-teams cap, invite-only** (those need new `games` columns + join-time enforcement).
- Team captain role + shareable team-invite links
- Team emblem/avatar (only color today)
- Per-team submission feed for the team to see their own history
- Per-team progress map view for the GM (locked/unlocked/completed grid) **✅** (`/games/[id]/progress`)
- Submission filter: **by mission ✅** (review gallery + per-mission page); **by team ✅** (team-pill filter on the By Status queue)

### §6 non-functional / production
- **Cloudflare R2** for media (currently Supabase Storage — fine for dev)
- **Image processing** (EXIF strip, thumbnails)
- **Direct-to-storage upload** — ✅ for batch mission upload; ❌ still for player submissions + single-mission reference image (those still go through the 110 MB server action)
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

> **Note:** the 2026-05-23 session (§0) is **uncommitted** on the working tree as of this writing. Run `git status` / `git diff` to see it before committing.

---

## 10. Suggested next steps (pick one)

The **GM / management cluster is done** (2026-05-24): progress map, CSV export, and submission-filter-by-team all shipped (§0). Remaining, in rough order of impact-per-effort:

1. ~~**Game settings UI** — name/description/schedule + status lifecycle~~ ✅ **done** (2026-05-23). Remaining sub-item: **team-size / max-teams / invite-only** caps (needs new `games` columns + enforcement in `joinTeam`/`createTeam`).
2. ~~**Per-team progress map**~~ ✅ **done** (2026-05-24) — `/games/[id]/progress`.
3. ~~**CSV export** of leaderboard + submissions~~ ✅ **done** (2026-05-24) — GET route handler + download links.
4. **Game cloning** *(very small)* — duplicate missions on insert; no team assignment carryover.
5. ~~**Submission filter by team**~~ ✅ **done** (2026-05-24) — team-pill filter on the By Status queue.
6. **GPS check-in submissions** *(completes PRD §5.3 submission types)* — reuse auto-validation pattern; Haversine in SQL is ~10 lines. UI is a "Use my location" button + lat/lng inputs.
7. **Direct-to-storage for player submissions** *(unlocks Vercel deployment)* — apply the §5.10 batch pattern to `submit*` and the single-mission reference upload.
8. **`pg_cron` worker** *(needed before push for time-gate / expiry notifications to fire when no one's on the page)* — every 30s call `refresh_game_state` for every active game.
9. **Web push proper** *(builds on the notification foundation)* — VAPID + service worker + `push_subscriptions` table + a worker reading new `notifications` rows.
10. **PWA polish** + **i18n** (BM + EN).

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
- **Batch upload can orphan storage objects** — if the GM uploads images then closes the tab before `createMissionsBatch` runs, the uploaded files sit in the bucket unreferenced. Harmless; a future cleanup sweep could remove unreferenced `mission-media/*/batch/*` objects.
- **`MissionForm` per-image points/type** — batch missions all share one points value + submission type; no per-image override yet.
- **CRLF/LF git warnings** on every commit are noise (Windows line endings). Not a problem; `core.autocrlf=true` would silence them if it bothers you.

---

## 14. End-to-end tests (Playwright)

Specs live in `e2e/`, config in `playwright.config.ts`. They drive a real browser against the dev server (auto-started via the `webServer` block, or reused if already running) + local Supabase. Local Supabase has email confirmations off (`config.toml`), so tests sign up a fresh unique-email user and use it immediately.

```bash
npm run test:e2e           # headless, all specs
npm run test:e2e:headed    # watch it drive a browser
npm run test:e2e:ui        # interactive runner / time-travel
npm run test:e2e:report    # open the HTML report
```

| Spec | Covers |
|---|---|
| `smoke.spec.ts` | home / login / signup / play pages render |
| `gm-flow.spec.ts` | signup → create game (asserts Team 1–4) → add mission |
| `form-preservation.spec.ts` | login keeps email on bad password; mission form required-answer keeps title; specific-teams-with-none disables submit |
| `announcement-flow.spec.ts` | GM broadcast → joined player sees it in notifications (two browser contexts) |
| `review-by-mission.spec.ts` | judged mission → player submits → GM reviews via gallery → per-mission page → approve (stays on page) |
| `batch-upload.spec.ts` | multi-select images (additive) → filename→title derivation → create → land on Setup |
| `game-lifecycle.spec.ts` | (1) pause → resume gating; (2) schedule "in 2h" → player sees countdown; (3) schedule at an absolute time |
| `game-theme.spec.ts` | GM sets the Matrix theme → player sees `data-theme="matrix"` + rain canvas; GM sets the Treasure Hunt theme → player sees `data-theme="treasure"` + `.treasure-backdrop` waves |
| `game-intro.spec.ts` | GM sets cover image + location → joining player sees them on the intro screen |
| `gm-management.spec.ts` | player submits → GM progress map shows pending/unlocked cells; review team filter empties for Team 2 / shows Team 1; submissions + leaderboard CSV export return `text/csv` |
| `media-export.spec.ts` | player submits a photo → GM's `type=media` download returns a ZIP (PK signature) containing `Team 1/Team 1 - Beach Selfie.png`; Review shows the gated "Download media" link |
| `theme-toggle.spec.ts` | with the OS emulated to dark, the app still defaults to light; the header toggle cycles light → dark → system → light and the choice persists across reload |

Notes:
- `workers: 1`, `retries: 1` (absorbs Turbopack cold-compile flakes), failure artifacts (screenshot/video/trace) under `test-results/` (gitignored).
- A few `data-testid`s exist purely for tests: `join-code` (Setup), `batch-files-input` (batch upload).
- `e2e/` and `playwright.config.ts` are excluded from `tsconfig.json` so app `tsc` stays clean.
- Helpers in `e2e/helpers.ts`: `signup`, `createGame`, `createTextMission`, `createJudgedTextMission`, `joinAsGuest`, `pickTeam`, `submitTextMission`, `uniqueEmail`.
