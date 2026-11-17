-- ═══════════════════════════════════════════════════════════════════════
--  0000_reset.sql — پاک‌سازی کامل دیتابیس
--
--  ⚠️⚠️ خطر: این فایل **همه چیز** را حذف می‌کند: جدول‌ها، داده‌ها،
--  ویوها، توابع، تایپ‌ها و سیاست‌های RLS در schema `public`.
--  فقط روی پروژهٔ تازه یا محیط توسعه اجرا شود.
--
--  چرا `drop schema public cascade` و نه فهرست جدول‌ها؟
--  ────────────────────────────────────────────────────────────────
--  فهرست دستی جدول‌ها همیشه یکی جا می‌ماند (تابع، ویو، تایپ enum) و بعد
--  مهاجرت بعدی روی باقی‌مانده‌ها می‌شکند. `cascade` تضمین می‌کند هیچ
--  شیئی از نسخهٔ قبلی باقی نماند.
--
--  نکته: Supabase روی schema `public` مجوزهای پیش‌فرض می‌دهد؛ بعد از
--  بازسازی، مجوزها را دوباره می‌دهیم تا PostgREST بتواند بخواند.
--
--  اجرا: Supabase Dashboard → SQL Editor → این فایل → Run
--        سپس ۰۰۰۱ به بعد را به ترتیب اجرا کنید.
-- ═══════════════════════════════════════════════════════════════════════

-- ۱) قطع دسترسی‌های بازمانده (وگرنه drop با وابستگی شکست می‌خورد)
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ۲) حذف کامل schema و بازسازی آن
drop schema if exists public cascade;
create schema public;

-- ۳) مجوزهای استاندارد Supabase
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ۴) افزونه‌ها (اگر از قبل هستند، خطا نمی‌دهد)
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ۵) تأیید
select 'reset complete' as status, now() as at;
