# LLWA — Learn Language With AI

An adaptive, AI-driven language tutor shipped as a **native mobile app** (React Native / Expo)
with a **separate web admin console** and a **serverless edge backend** on Cloudflare.

The product is built around one idea: **a fixed learning map with adaptive execution**.
The long-term path (goal → steps → weekly cycles → daily lessons) is designed once and
versioned. Each cycle adapts only inside that map, driven by recorded evidence of what the
learner actually did — never by the model re-inventing the route.

---

## Repository layout

```
mobile/               React Native app (Expo SDK 58) — the learner experience
apps/admin/           Web admin console (Vite + React) — deployed to Cloudflare Pages
apps/web/             Legacy web app kept as a browser fallback / reference UI
workers/edge/         API on Cloudflare Workers (router + services + AI orchestration)
workers/web/          Static host Worker for apps/web
packages/shared/      Types, zod schemas, constants, and translations shared by all clients
supabase/migrations/  Postgres schema (Supabase)
scripts/              Deploy, backup, and smoke-test helpers
docs/                 API contracts, retention policy, backup & recovery
```

> `mobile/` is intentionally **not** an npm workspace. Expo's Metro bundler and the web
> apps resolve React differently, and sharing one `node_modules` causes duplicated-React
> crashes that are painful to debug. Metro is configured to read the shared translations
> from `packages/shared` instead.

---

## Domains

| Host | Serves | Hosting |
|---|---|---|
| `infolange.ir` | reserved, kept clean (no records) | — |
| `api.infolange.ir` | API gateway | Cloudflare Worker `llwa-edge` |
| `app.infolange.ir` | legacy web app | Cloudflare Worker `llwa-web` |
| `admin.infolange.ir` | admin console | Cloudflare Pages `llwa-admin` |

Custom domains are declared in each `wrangler.toml` with `custom_domain = true`, so the
Worker creates its own DNS record on deploy. The apex domain stays untouched on purpose.

---

## Getting started

Requirements: Node ≥ 20, npm ≥ 10, and (for Android builds) JDK 17 + Android SDK.

```bash
npm install                      # installs workspaces (not mobile/)
npm --prefix mobile install      # installs the Expo app separately

npm run typecheck                # all workspaces + mobile
npm test                         # backend unit tests
```

### Mobile app

```bash
cd mobile
cp .env.example .env             # EXPO_PUBLIC_DEMO_MODE=true by default
npm run android                  # local native build (needs Android SDK)
npm run start                    # Metro dev server
```

For iOS you need macOS or an EAS cloud build (`eas build -p ios`). The project is fully
configured for both; nothing is Windows-specific.

### Admin console

```bash
npm run dev:admin                # http://localhost:5180
```

### API

```bash
npm run dev:edge                 # wrangler dev on 127.0.0.1:8787
```

---

## Authentication

Three entry points, one session model (a short-lived HS256 JWT issued by the Worker):

1. **Google Sign-In** (production). The app sends a Google `idToken`; the Worker verifies it
   against Google's JWKS (RS256, issuer, audience, expiry, `email_verified`) and only then
   creates the session. The client never sends profile data we trust.
2. **Demo sign-in** (MVP only). Enabled with `DEMO_MODE=true`. Creates a per-device test
   user so the whole flow can be exercised without any Google Cloud setup. Never an admin.
3. **Admin password** (MVP). `auth-admin` accepts `ADMIN_PANEL_PASSWORD` with a
   constant-time comparison and issues a `SUPER_ADMIN` session. To be replaced by SSO.

Identity is keyed on the internal `users.id` (UUID). `telegram_id` still exists for the
bot path but is nullable — mobile users do not have one. This is why admin operations take
`userId`, not `telegramId`.

---

## AI pipeline

Content is produced in five separate model calls, each with its own prompt, schema, budget,
and version. Splitting them keeps latency and token cost low and lets each stage be tuned
independently.

| # | Task key | Input | Output | When |
|---|---|---|---|---|
| 1 | `placement-test` | source/target language, self-reported level, goal | graded questions across the four skills | first sign-in |
| 2 | `goal-to-steps` | target language, goal, placement result | steps + measurable milestone per step | once, and on goal change |
| 3 | `step-to-cycles` | previous milestone, current milestone, past performance | weekly cycles + milestone per cycle | when a step ends |
| 4 | `cycle-to-lessons` | previous/current cycle milestone, past performance | seven day-level syllabi | when a cycle ends |
| 5 | `lesson-content` | the day's syllabus | the full lesson, sized to the learner's daily minutes | before the learner opens it |

Prompts for all five live in the database (`ai_prompts`) and are editable and versioned from
the admin console. Saving always creates a **new version**; exactly one version per task can
be active (enforced by a partial unique index). If no active row exists, the built-in prompt
in `ai-engine.ts` is used.

Reuse is deliberate: before generating content the engine looks for an existing word card,
pattern, or lesson for the same language/level/goal and reuses it. Repeating an existing
word does not cost a model call.

---

## Learning model

- **Fixed map, adaptive execution.** `learning-map.ts` builds a versioned map of stages with
  prerequisites, objectives, and pass criteria. Every adaptation appends a decision record
  (rule, evidence, timestamp, map version, before/after) so changes are explainable.
- **Cycle shape.** Five learning days, one low-pressure transfer day, one rest day. Days 6
  and 7 are deliberately not exam-shaped.
- **Spaced repetition.** A five-box Leitner engine, independent of the weekly cycle. The
  learner answers *before* seeing the answer — showing the answer first is not retrieval.
- **Lesson length.** Item and question counts scale with `dailyMinutes`
  (`≤10 → 0.8`, `≤20 → 1.2`, `≤30 → 1.6`, else `2`), so a 15-minute learner does not get a
  30-minute lesson.
- **Deterministic drills.** Free writing is checked with a word-tile sentence builder whose
  answer is known in advance. No model call, no flaky evaluation.

---

## Configuration

Backend secrets (set with `wrangler secret put`, never committed):

| Name | Purpose |
|---|---|
| `JWT_SECRET` | signs session tokens |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | database access |
| `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` / `ANTHROPIC_API_KEY` | fallback AI providers |
| `PROVIDER_ENCRYPTION_KEY` | encrypts admin-entered provider keys (AES-GCM) |
| `GOOGLE_CLIENT_IDS` | comma-separated accepted Google audiences (web, Android, iOS) |
| `ADMIN_EMAILS` | emails promoted to `SUPER_ADMIN` on first sign-in |
| `ADMIN_PANEL_PASSWORD` | MVP password for the admin console |
| `DEMO_MODE` | `true` enables password-free demo sign-in — **off in production** |
| `TELEGRAM_BOT_TOKEN` | optional, only for the bot path |

Public variables live in `wrangler.toml` (`[vars]`) and `mobile/.env` (`EXPO_PUBLIC_*`).

---

## Database

Postgres via Supabase. Migrations are applied in order from `supabase/migrations/`:

```
0001_init → 0002_rls → 0003_seed → 0004_ai_providers → 0005_support_admin_content
0006_admin_messages → 0007_plan_crud → 0008_admin_message_sender → 0009_admin_title
0010_lesson_objective → 0011_ai_provider_kind → 0012_media_files → 0013_term_cards
0014_perf_indexes → 0015_google_auth → 0016_admin_console
```

`0015` makes `telegram_id` nullable and adds `google_sub`, `email`, `auth_provider`, and push
columns. `0016` adds `ai_prompts`, `feature_flags`, and `audit_log`.

Apply with the Supabase SQL editor (paste in order) or `supabase db push`.

---

## Deployment

```bash
npm run deploy:edge     # typecheck → test → dry-run → wrangler deploy
npm run deploy:web      # build apps/web → static Worker
npm run deploy:admin    # build apps/admin → Cloudflare Pages
npm run deploy:all      # all three, in order
```

---

## Testing

```bash
npm test                                  # 85 backend tests (vitest)
cd mobile && npx tsc --noEmit             # mobile typecheck
bash scripts/e2e-smoke.sh                 # end-to-end smoke against a live API
```

Notable guards: `ai-engine-schema.test.ts` locks the model's output schema to exactly what
the UI renders (a previous schema leaked ~7,700 tokens per cycle);
`google-auth.test.ts` rejects `alg: none`, HS256, unknown `kid`, and wrong audiences.

---

## Conventions

- **Commits are written in English.**
- No `any` in the AI boundary — every model output is validated by zod before it is stored.
- Cache hits and cache misses must return the **same response shape**.
- Any URL returned to a client must be absolute (API and clients live on different origins).
- The daily lesson must open without a live model call; content is generated ahead of time.
