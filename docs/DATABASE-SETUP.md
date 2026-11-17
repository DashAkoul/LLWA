# Database setup

Everything runs on a single Supabase Postgres project. This file is the exact,
ordered procedure for building it from zero.

---

## 1. Wipe (only on a fresh or disposable project)

Open **Supabase Dashboard → SQL Editor** and run:

```
supabase/migrations/0000_reset.sql
```

This drops `schema public` with `cascade` — tables, views, enums, functions and
RLS policies — then recreates it and restores the grants Supabase's PostgREST
needs. Nothing from the previous version survives, which is the point: the old
files were written for the Telegram Mini App and carried its assumptions.

> ⚠️ Irreversible. On an existing project take a backup first
> (`scripts/backup-supabase.sh`).

---

## 2. Schema, in order

Run each file in the SQL editor, in this order. Every file is idempotent, so a
re-run is safe.

| File | What it creates |
|---|---|
| `0001_init.sql` | users, cycles, lessons, lexical_items, subscriptions, star_transactions, telemetry, plans |
| `0002_rls.sql` | row-level security policies |
| `0003_seed.sql` | default plans and pricing |
| `0004_ai_providers.sql` | AI provider pool with ordered failover |
| `0005_support_admin_content.sql` | support tickets, admin roles, content cache |
| `0006_admin_messages.sql` | in-app messages |
| `0007_plan_crud.sql` | `plan_type` becomes text so plans are editable |
| `0008_admin_message_sender.sql` | message sender metadata |
| `0009_admin_title.sql` | admin titles |
| `0010_lesson_objective.sql` | per-lesson objective |
| `0011_ai_provider_kind.sql` | TEXT / TTS / STT provider kinds |
| `0012_media_files.sql` | media objects and audio cache |
| `0013_term_cards.sql` | global word cards + `find_term_cards()` |
| `0014_perf_indexes.sql` | the indexes that queries actually use |
| `0015_google_auth.sql` | Google identity, nullable telegram_id, push columns |
| `0016_admin_console.sql` | prompts, feature flags, audit log |
| `0017_lexicon.sql` | lexicon (words → entries → senses), lookup view, seed function |

---

## 3. Load the lexicon

The dictionary is generated from the Longman Communication 3000 export and
committed under `supabase/seed/lexicon/`.

```
part-001.sql … part-022.sql   # 3159 words, 5200 entries, 25110 senses
99_seed_term_cards.sql        # copies senses into term_cards
```

### Recommended: REST import (handles the volume)

The generated SQL totals ~27 MB and a few single files exceed 2 MB, which the
dashboard SQL editor struggles with. Import through the REST API instead:

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node tools/import-lexicon.mjs --input "C:/path/to/longman3000.json"
```

The script upserts in batches, is safe to re-run, and calls
`seed_term_cards_from_lexicon()` at the end.

### Alternative: SQL files

Run every `part-*.sql` (order does not matter — each file is self-contained and
wraps itself in a transaction), then run `99_seed_term_cards.sql` **last**.

To regenerate from a new export:

```bash
node tools/build-lexicon-sql.mjs \
  --input "C:/path/to/longman3000.json" \
  --out supabase/seed/lexicon
```

The generator writes deterministic UUIDs derived from each row's logical key, so
re-running it produces the same ids and never duplicates rows.

---

## 4. Seed term cards

`99_seed_term_cards.sql` calls:

```sql
select public.seed_term_cards_from_lexicon('en', 'fa', 1);
```

It copies one Persian sense per word — preferring the lowest CEFR level and the
first sense — into `term_cards`, which the lesson generator already reads. From
that point on, generating a lesson for these words costs **zero tokens** for
meanings, examples, and pronunciation.

Only senses that have both a Persian translation and at least one example are
copied; a card without an example is useless for teaching.

---

## 5. Configure the Worker

```bash
cd workers/edge
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Then verify:

```bash
curl "https://api.infolange.ir/llwa74/9xkr2mqv/v1/gate?action=health"
```

---

## Notes

- **One active prompt per task.** `ai_prompts` has a partial unique index on
  `(task_key) where is_active`. The admin console deactivates the previous
  version before activating a new one, so the constraint can never be violated.
- **Content is public, state is private.** `lexicon_*` tables are read-only for
  `anon`/`authenticated`; all per-user tables are protected by RLS and only
  reachable through the Worker's service role.
- **No data is written to `public` by clients.** Every write goes through the
  Worker, which is why RLS policies on user tables deny by default.
