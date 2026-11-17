-- ═══════════════════════════════════════════════════════════════════════
-- 0015_google_auth.sql
--
-- ورود با حساب گوگل (اپ موبایل React Native)
--
-- چرا؟
-- ─────
-- تا اینجا هویت کاربر فقط `telegram_id` بود که برای مینی‌اپ تلگرام کافی
-- بود. در اپ نیتیو، کاربر با حساب گوگل وارد می‌شود و ممکن است هیچ‌وقت
-- تلگرام باز نکند. پس:
--
--   • `telegram_id` باید NULL-پذیر شود (کاربر گوگل آن را ندارد).
--   • `google_sub` اضافه می‌شود — شناسهٔ پایدار گوگل (`sub` در idToken).
--     ⚠️ این فیلد هرگز نباید ایمیل باشد؛ کاربر می‌تواند ایمیلش را عوض کند
--     ولی `sub` تا ابد ثابت است.
--   • `email` برای تطبیق حساب قدیمی تلگرامی با گوگل استفاده می‌شود.
--   • `auth_provider` نشان می‌دهد کاربر از کدام مسیر آمده است.
--
-- ⚠️ نکتهٔ مهم دربارهٔ یکتایی:
--   در Postgres چند NULL در یک ستون UNIQUE با هم تعارض ندارند، پس
--   `telegram_id` می‌تواند هم‌زمان UNIQUE و NULL-پذیر بماند و کاربران
--   گوگل (که telegram_id = NULL دارند) با هم تعارض پیدا نمی‌کنند.
-- ═══════════════════════════════════════════════════════════════════════

-- ── ۱. تلگرام اختیاری می‌شود ──────────────────────────────────────────
alter table public.users
  alter column telegram_id drop not null;

-- ── ۲. ستون‌های هویت گوگل ────────────────────────────────────────────
alter table public.users
  add column if not exists google_sub     text,
  add column if not exists email          citext,
  add column if not exists auth_provider  text not null default 'TELEGRAM';

-- ── ۳. محدودیت‌ها ────────────────────────────────────────────────────
-- ⚠️ برای google_sub و email از ایندکس یکتای جزئی (partial unique index)
-- استفاده می‌کنیم، نه CONSTRAINT UNIQUE. دلیل: در Postgres چند NULL در یک
-- ستون UNIQUE با هم تعارض ندارند ولی ایندکس جزئی هم حجم کمتری دارد و هم
-- قصد را صریح بیان می‌کند («یکتا فقط وقتی مقدار دارد»).
do $$
begin
  -- auth_provider فقط دو مقدار مجاز
  if not exists (
    select 1 from pg_constraint where conname = 'users_auth_provider_check'
  ) then
    alter table public.users
      add constraint users_auth_provider_check
      check (auth_provider in ('GOOGLE', 'TELEGRAM'));
  end if;

  -- ⚠️ هر کاربر باید حداقل یک هویت داشته باشد. بدون این قید، یک ردیف
  -- کاملاً بی‌هویت می‌تواند ساخته شود و هیچ‌وقت قابل ورود نباشد.
  if not exists (
    select 1 from pg_constraint where conname = 'users_identity_present_check'
  ) then
    alter table public.users
      add constraint users_identity_present_check
      check (telegram_id is not null or google_sub is not null);
  end if;
end $$;

-- ── ۴. ایندکس‌ها ─────────────────────────────────────────────────────
-- جست‌وجوی ورود با گوگل روی این ستون انجام می‌شود
create unique index if not exists idx_users_google_sub
  on public.users (google_sub) where google_sub is not null;

create unique index if not exists idx_users_email
  on public.users (email) where email is not null;

-- ── ۵. ستون‌های اعلان (push) برای اپ موبایل ──────────────────────────
-- توکن Expo Push برای یادآور روزانه؛ در مینی‌اپ تلگرام استفاده نمی‌شد.
alter table public.users
  add column if not exists push_token       text,
  add column if not exists push_platform    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_push_platform_check'
  ) then
    alter table public.users
      add constraint users_push_platform_check
      check (push_platform is null or push_platform in ('ios', 'android'));
  end if;
end $$;

-- ── ۶. توضیح ستون‌ها ─────────────────────────────────────────────────
comment on column public.users.telegram_id is
  'شناسهٔ تلگرام — برای کاربران اپ موبایل (ورود با گوگل) NULL است';
comment on column public.users.google_sub is
  'شناسهٔ پایدار گوگل (claim sub) — هرگز ایمیل نیست';
comment on column public.users.auth_provider is
  'مسیر ورود: GOOGLE (اپ موبایل) یا TELEGRAM (مینی‌اپ/ربات)';
comment on column public.users.push_token is
  'Expo push token برای یادآورهای اپ موبایل';

-- ── ۷. بازسازی ویو/آمار وابسته (اگر وجود دارد) ───────────────────────
-- هیچ ویویی به telegram_id وابسته نیست؛ فقط برای اطمینان:
analyze public.users;
