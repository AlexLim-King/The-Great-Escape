<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Conventions

## Forms must preserve input on error (no redirect-to-clear)

When a form submission can fail validation or hit a server error, **do not
`redirect("/path?error=...")` from the server action** — redirecting
navigates away and wipes everything the user typed (uncontrolled inputs
reset). This is a recurring UX bug; avoid it from the start.

Use the `useActionState` pattern instead:

1. The server action signature is `(prevState, formData) => Promise<State>`
   where `State = { error?: string; values?: {...} }`.
2. On failure, **return** `{ error, values }` — `values` echoes back the
   user's input so the form can re-seed via `defaultValue`. **Never echo
   secrets** (passwords) back in `values`.
3. On success, `redirect(...)` as normal (this unmounts the form, so no
   reset problem).
4. The form is a client component (`"use client"`) using
   `const [state, formAction, pending] = useActionState(action, {})`,
   wired as `<form action={formAction}>`. Show `state.error` in a
   `.banner.banner-error`, set each input's `defaultValue={state.values?.x}`,
   and disable the submit button while `pending`.

Native `required` / `minLength` etc. still belong on inputs — they block
empty-field submits client-side for free. Reserve the returned-error path
for cross-field rules and genuine server errors (bad credentials, duplicate
email, DB failure).

Reference implementations: `login`/`signup`/`joinGame` in
`src/lib/auth-actions.ts` + `LoginForm`/`SignupForm`/`JoinGameForm`;
`createGame`/`createTeam` in `src/lib/gm-actions.ts` + `NewGameForm`/
`AddTeamForm`. `MissionForm` uses the sibling approach (client-side
validation gating submit) where that fits better.
