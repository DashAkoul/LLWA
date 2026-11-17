-- 99 — انتقال معانی فرهنگ به term_cards
--
-- ⚠️ این را **بعد از** همهٔ فایل‌های part-* اجرا کنید.
-- نتیجه: موتور درس برای این واژه‌ها دیگر به AI نیاز ندارد.

select public.seed_term_cards_from_lexicon('en', 'fa', 1) as cards_created;
