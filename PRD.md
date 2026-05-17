# Escape Room Mission Platform — PRD

**Status:** Draft v0.1
**Owner:** Alex L.
**Last updated:** 2026-05-01

---

## 1. Overview

A web-based, mobile-first platform for hosting escape-room-style scavenger-hunt games inspired by Goosechase, with two key differentiators:

1. **Conditional mission unlocking** — missions unlock based on prerequisites (linear, branching, graph, or time-gated).
2. **Team-specific missions** — organizers can pre-assign distinct mission sets per team within the same game.

The platform is multi-tenant: any organizer can create a new game (event), invite teams, design missions, and run live.

## 2. Goals & Non-goals

### Goals
- Support **up to 1000 concurrent players** per game, organized into teams.
- Mobile-first player experience (PWA-ready, no native app required for v1).
- Four submission types: **text, photo, video, GPS check-in**.
- Two validation modes per mission: **auto-validated (exact answer match / GPS proximity)** or **Game Master judged**.
- Flexible mission graph: linear, branching, prerequisite-based, time-gated.
- Per-team mission assignment by the organizer.
- Cost-effective infrastructure suitable for Malaysian market pricing.
- Portable architecture — no proprietary lock-in; can be self-hosted on any VPS.

### Non-goals (v1)
- Native iOS/Android apps (PWA only).
- AI-based photo/video judging (humans verify, or exact-match text).
- Payments / monetization (free or invitation-based for v1).
- Public game discovery / matchmaking.
- Social features beyond team chat.

## 3. Users & Roles

| Role | Capabilities |
|---|---|
| **Super Admin** | Manage platform tenancy, view all games, suspend abuse |
| **Organizer / Game Master (GM)** | Create games, design missions, manage teams, judge submissions, view live dashboard |
| **Team Captain** | Create team, invite members, accept assigned missions |
| **Player** | Join a team, view assigned missions, submit answers |

A single user account can hold multiple roles across different games.

## 4. Core Concepts (Domain Model)

```
Game (Event)
├── Teams (1..N)
│   └── Members (1..M)
├── Missions (1..K)
│   ├── Submission Type: text | photo | video | gps
│   ├── Validation: auto | gm_judged
│   ├── Prerequisites: list of mission IDs / time gates / boolean expression
│   └── Assigned to: all_teams | specific_team_ids
└── Submissions
    ├── Status: pending | approved | rejected
    └── Verified by: auto | gm_user_id
```

## 5. Functional Requirements

### 5.1 Game / Event Management (GM)
- Create a game with name, description, start/end time, timezone.
- Define team size limits, max number of teams, join code or invite-only.
- Clone an existing game's mission set when creating a new one.
- Pause / resume / end the game.

### 5.2 Team Management
- Organizer creates teams or enables self-formation with a team join code.
- Team captain invites members via shareable link.
- Each team has a name, color/emblem, and submission feed.

### 5.3 Mission Authoring (GM)
A mission has:
- **Title, description, points, optional image/hint media**
- **Submission type** (text | photo | video | gps)
- **Validation mode:**
  - *Auto:* exact-match answer (case-insensitive, configurable trim/normalize), or GPS proximity (lat/lng + radius in meters)
  - *GM Judged:* submission goes into the GM review queue
- **Unlock rules** (any combination):
  - Always available
  - Requires mission(s) X, Y completed (AND)
  - Requires any of mission(s) X or Y (OR)
  - Time gate: not available before timestamp T
  - Combined boolean expression: `(M1 AND M2) OR (M3 AFTER 14:00)`
- **Deadline / time-to-complete (optional):** if set, mission auto-fails when the deadline passes without an approved submission. Three modes:
  - *Absolute:* must complete before clock time `T` (e.g., before 17:00 game day)
  - *Relative to unlock:* must complete within `D` minutes of the mission becoming unlocked **for that specific team** (most common — gives every team an equal window)
  - *Relative to game start:* must complete within `D` minutes of the game starting
  - On expiry: state transitions to `failed`; mission stays visible to the team marked as expired; points = 0; downstream missions whose unlock depends on this one are evaluated against `failed` (treated as not-completed for AND, satisfiable for OR if alternatives exist).
- **Assignment scope:**
  - All teams (default)
  - Specific team IDs (per-team missions)

### 5.4 Player Submission Flow
- Player sees only **unlocked** missions assigned to their team.
- Submission UI adapts to type (text input / camera / video record / GPS button).
- **Only one team member needs to submit** per mission; once submitted, status becomes `pending` for the whole team.
- After validation passes, mission is marked complete for the team and unlock graph re-evaluates.
- For missions with a deadline, the player UI shows a **live countdown timer**; missions within 5 min of expiry are visually highlighted. On expiry, the mission flips to a "Time's up" state and is no longer submittable.

### 5.5 GM Live Dashboard
- Submission review queue (pending judgments) with photo/video/text preview.
- Approve / reject + optional feedback to team.
- Live leaderboard (per-team points + completed mission count).
- Per-team progress map showing unlocked/locked/completed missions.
- Filter by team, mission, status; export results to CSV.

### 5.6 Notifications
- Push (web push API) for: mission unlocked, submission judged, game starting/ending.
- Optional email fallback.

## 6. Non-functional Requirements

| Area | Target |
|---|---|
| Concurrent players (single game) | 1000 |
| Concurrent submissions/sec (peak) | 50 |
| Page load (mobile, 4G in MY) | < 3s first contentful paint |
| Photo upload max size | 10 MB |
| Video upload max size | 100 MB, max 60s |
| Uptime | 99.5% (best-effort, single region) |
| Storage cost target | < RM 50/month for typical event of 100 players |
| Data residency | Singapore / Hong Kong region acceptable |

## 7. Technical Architecture

### 7.1 Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14+ (App Router) + TypeScript + Tailwind** | PWA support, mobile-first, huge talent pool |
| Backend | **Next.js API routes / Server Actions** | Single deployable, simple for v1 |
| Database | **PostgreSQL via Supabase** | Managed Postgres free tier, plain SQL — portable to any VPS later |
| Auth | **Supabase Auth** (email + OAuth) | Built-in, JWT-based, replaceable with Auth.js |
| Realtime | **Supabase Realtime** (Postgres LISTEN/NOTIFY) | Live leaderboard / unlock notifications |
| File storage | **Cloudflare R2** | S3-compatible, **zero egress fees** (critical for photo/video — Malaysia bandwidth is expensive) |
| Image processing | **Cloudflare Images** or `sharp` on the server | Thumbnails, EXIF strip |
| Hosting | **Vercel** (free tier) initially | One-click; can move to a VPS in Singapore later |
| Push notifications | **Web Push API + VAPID** | No vendor lock-in |
| CI/CD | **GitHub Actions** | Standard |

**Portability statement:** every component is either open-source or has a documented self-hosted equivalent. Postgres dump → restore on any VPS, R2 → MinIO, Supabase Auth → Auth.js. No business logic depends on a closed API.

### 7.2 Data Model (high level)

```
users(id, email, name, created_at)
games(id, name, owner_id, status, starts_at, ends_at, join_code, ...)
teams(id, game_id, name, color, captain_id, ...)
team_members(team_id, user_id, role)
missions(
  id, game_id, title, description, media_url,
  submission_type, validation_mode,
  expected_answer, gps_lat, gps_lng, gps_radius_m,
  points, unlock_expression, time_gate_at,
  deadline_mode,         -- null | 'absolute' | 'relative_to_unlock' | 'relative_to_game_start'
  deadline_at,           -- timestamp, used when deadline_mode = 'absolute'
  deadline_duration_sec, -- int,       used when deadline_mode = 'relative_*'
  assignment_mode        -- 'all' | 'specific'
)
mission_team_assignments(mission_id, team_id)  -- only for 'specific' scope
submissions(
  id, mission_id, team_id, submitted_by_user_id,
  payload_text, media_url, gps_lat, gps_lng,
  status, verified_by, verified_at, feedback
)
team_mission_state(team_id, mission_id, state, unlocked_at, completed_at, expires_at)
  -- locked | unlocked | submitted | approved | rejected | failed_expired
  -- expires_at is computed when the mission unlocks for that team (or at game start / authored absolute time)
```

### 7.3 Key Algorithms
- **Unlock evaluator:** when any submission is approved, recompute `team_mission_state` for that team by evaluating each locked mission's `unlock_expression` against the team's completed set + current timestamp. On unlock, write `unlocked_at` and compute `expires_at` from the mission's deadline config.
- **Deadline expiry worker:** scheduled job (every 30s) that finds rows where `state = 'unlocked'` and `expires_at <= now()`, transitions them to `failed_expired`, fires a push notification to the team, and re-runs the unlock evaluator for any missions whose expression depends on this one. Runs as a Postgres `pg_cron` job or a Vercel Cron + Supabase function.
- **GPS validator:** Haversine distance check against `gps_radius_m`.
- **Answer validator:** normalize (trim + lowercase + collapse whitespace + optional accent strip), then compare.

## 8. Phased Rollout

**MVP (Phase 1) — 4–6 weeks**
- Auth (Supabase) + create game + create teams (manual)
- Author missions (text + photo only) + linear prerequisites
- Player submission + GM judging UI
- Basic leaderboard
- All-teams assignment (no per-team yet)

**Phase 2**
- GPS + video submissions
- Per-team mission assignment
- Branching / boolean unlock expressions + time gates
- **Time-sensitive missions** (deadlines + auto-fail worker + countdown UI)
- Web push notifications

**Phase 3**
- Live realtime leaderboard via Supabase Realtime
- CSV export, game cloning
- Polish, accessibility, i18n (EN + BM)

## 9. Open Questions
- Will video submissions be stored long-term, or auto-deleted after the event?
- Should rejected submissions be re-submittable, and how many retries?
- Do we need offline submission queueing (player goes through tunnel/dead zone)?
- Do organizers need a self-serve billing/quota system, or is v1 invitation-only?
- Localization priority: Bahasa Malaysia + English at launch, or English only?

## 10. Success Metrics (v1)
- Time-to-first-game for a new organizer < 30 minutes.
- Mission submission round-trip (player tap → server → judge view) < 2s on 4G.
- < 1% submission failure rate due to platform errors.
- One full event of 100+ players completed end-to-end without manual intervention.

---

## Appendix A — Suggested Claude Code Subagent Breakdown

When implementing, these are natural agent boundaries:

| Agent | Scope |
|---|---|
| `db-schema-agent` | Postgres schema + migrations + RLS policies |
| `auth-agent` | Supabase Auth wiring, role middleware |
| `game-mgmt-agent` | Game/team CRUD, join codes |
| `mission-author-agent` | Mission editor UI + unlock-expression DSL |
| `submission-agent` | Player submission flow, file upload to R2 |
| `validator-agent` | Auto-validation (text/GPS) + unlock recompute |
| `gm-dashboard-agent` | Judging queue, leaderboard, exports |
| `notifications-agent` | Web push + email fallback |
| `pwa-agent` | Service worker, offline shell, install prompt |
