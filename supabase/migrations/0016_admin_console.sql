-- ═══════════════════════════════════════════════════════════════════════
-- 0016_admin_console.sql
--
-- زیرساخت کنسول مدیریت: پرامپت‌های نسخه‌دار، فلگ‌های قابلیت، audit log
--
-- چرا؟
-- ─────
-- طبق قواعد محصول، پرامپت هر فراخوانی هوش مصنوعی باید از پنل قابل ویرایش
-- و نسخه‌بندی باشد، و هر تغییر حساس باید ردی قابل ممیزی داشته باشد.
-- تا اینجا پرامپت‌ها هارد‌کد در `ai-engine.ts` بودند و تغییرشان نیاز به
-- دیپلوی داشت.
-- ═══════════════════════════════════════════════════════════════════════

-- ── ۱. پرامپت‌ها ─────────────────────────────────────────────────────
-- ⚠️ الگوی «فقط یک نسخهٔ فعال در هر task_key» با ایندکس یکتای جزئی
-- اعمال می‌شود، نه با منطق برنامه. این تضمین در سطح دیتابیس است تا حتی
-- اگر دو مدیر هم‌زمان فعال‌سازی بزنند، وضعیت متناقض ساخته نشود.
create table if not exists public.ai_prompts (
  id          uuid primary key default gen_random_uuid(),
  task_key    text not null,
  version     int  not null,
  body        text not null,
  is_active   boolean not null default false,
  notes       text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint ai_prompts_version_positive check (version > 0),
  constraint ai_prompts_body_not_empty check (length(btrim(body)) > 0)
);

-- شمارهٔ نسخه در محدودهٔ هر task یکتاست
create unique index if not exists idx_ai_prompts_task_version
  on public.ai_prompts (task_key, version);

-- فقط یک نسخهٔ فعال برای هر task
create unique index if not exists idx_ai_prompts_active
  on public.ai_prompts (task_key) where is_active;

create index if not exists idx_ai_prompts_task
  on public.ai_prompts (task_key, version desc);

-- ── ۲. فلگ‌های قابلیت ───────────────────────────────────────────────
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  description text,
  updated_by  uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- فلگ‌های اولیه — همه خاموش به‌جز آن‌هایی که MVP لازم دارد
insert into public.feature_flags (key, enabled, description) values
  ('demo_mode',         true,  'ورود آزمایشی بدون گوگل (فقط MVP)'),
  ('calibration',       true,  'آزمون تعیین سطح در اولین ورود'),
  ('spaced_repetition', true,  'موتور مرور فاصله‌دار (لایتنر)'),
  ('story_part',        true,  'بخش سوم درس: داستان + درک مطلب'),
  ('roleplay',          true,  'نقش‌آفرینی با ارزیابی AI'),
  ('payments',          false, 'درگاه پرداخت و خرید اشتراک'),
  ('push_notifications', false, 'یادآور روزانه با Expo Push')
on conflict (key) do nothing;

-- ── ۳. audit log ────────────────────────────────────────────────────
-- هر عملیات حساس: تغییر قیمت، تغییر پرامپت، فلگ، اتصال AI.
create table if not exists public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.users(id) on delete set null,
  action     text not null,
  target     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created
  on public.audit_log (created_at desc);

create index if not exists idx_audit_log_action
  on public.audit_log (action, created_at desc);

-- ── ۴. RLS ──────────────────────────────────────────────────────────
-- سرویس‌رول RLS را دور می‌زند؛ این قواعد فقط دسترسی مستقیم کلاینت را
-- می‌بندند (هیچ کلاینتی نباید مستقیم به این جدول‌ها بزند).
alter table public.ai_prompts    enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_log     enable row level security;

comment on table public.ai_prompts is
  'نسخه‌های پرامپت هر فراخوانی AI — فقط یک نسخهٔ فعال در هر task_key';
comment on table public.feature_flags is
  'کلید/مقدار قابلیت‌ها — تغییر در سرور اعمال می‌شود';
comment on table public.audit_log is
  'رد ممیزی عملیات حساس پنل مدیریت';
