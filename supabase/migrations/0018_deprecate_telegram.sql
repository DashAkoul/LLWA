-- ═══════════════════════════════════════════════════════════════════════
--  0018_deprecate_telegram.sql
--
--  مینی‌اپ تلگرام منسوخ شد. این مهاجرت بقایای آن را از دیتابیس پاک می‌کند.
--
--  ⚠️ این فایل **مخرب** است: ستون `telegram_id` و جدول `star_transactions`
--  حذف می‌شوند. اگر روی دیتابیسی با کاربران واقعی تلگرام اجرا شود، آن
--  کاربران دیگر قابل ورود نیستند (چون هویتشان فقط با همان شناسه بود).
--
--  روی دیتابیس تازه (که از 0001 ساخته می‌شود) این حذف‌ها بی‌خطر است و
--  صرفاً تاریخچه را صادق نگه می‌دارد.
--
--  چرا حذف و نه رها کردن؟
--  ────────────────────────
--  ستون nullableِ بی‌استفاده، هر توسعه‌دهندهٔ بعدی را گمراه می‌کند و در
--  کوئری‌ها به‌اشتباه select می‌شود. هویت اپ موبایل `users.id` است.
-- ═══════════════════════════════════════════════════════════════════════

-- ── ۱. قید «هر کاربر حداقل یک هویت» ──────────────────────────────────
-- در 0015 این قید روی telegram_id هم تکیه داشت؛ حالا فقط ایمیل/گوگل.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%telegram_id%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

-- ── ۲. ستون هویت تلگرام ─────────────────────────────────────────────
drop index if exists public.users_telegram_id_key;
drop index if exists public.idx_users_telegram;
alter table public.users drop column if exists telegram_id cascade;

-- ── ۳. پرداخت Telegram Stars ────────────────────────────────────────
drop table if exists public.star_transactions cascade;

alter table public.plans drop column if exists price_stars cascade;
alter table public.subscriptions drop column if exists price_stars cascade;

-- ── ۴. فرستندهٔ پیام ادمین ──────────────────────────────────────────
alter table public.admin_messages drop column if exists sender_telegram_id cascade;
alter table public.admin_messages drop column if exists sent_via_bot cascade;

-- ── ۵. پیش‌فرض هویت ─────────────────────────────────────────────────
-- در 0015 پیش‌فرض `'TELEGRAM'` بود؛ حالا گوگل تنها مسیر واقعی است.
alter table public.users alter column auth_provider set default 'GOOGLE';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'language_source'
  ) then
    execute 'alter table public.users alter column language_source set default ''MANUAL''';
  end if;
end $$;

-- ── ۶. تأیید ────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name like '%telegram%') as remaining_telegram_columns,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'star_transactions') as star_table_exists;
