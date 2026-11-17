-- ═══════════════════════════════════════════════════════════════════════
--  0017_lexicon.sql — واژگان پایه (فرهنگ لغت)
--
--  منبع: Longman Communication 3000 (۳٬۱۵۹ واژه، ۵٬۲۰۰ مدخل، ۲۵٬۱۱۰ معنی،
--  ۳۴٬۶۳۰ مثال، ترجمهٔ فارسی برای ۹۶٪ معانی).
--
--  چرا این جداول؟
--  ─────────────
--  قاعدهٔ محصول: «هر محتوایی که تولید می‌شود ذخیره شود تا دوباره ساخته
--  نشود.» برای واژه، این قاعده باید از **منبع معتبر** شروع شود، نه از مدل.
--  اگر مدل برای واژهٔ «help» معنی بسازد، ممکن است هر بار متفاوت باشد.
--  با این فرهنگ:
--    • معنی و مثالِ ثابت و بازبینی‌شده داریم (صفر توکن)
--    • سطح CEFR هر معنی مشخص است → انتخاب واژه متناسب با سطح کاربر
--    • تلفظ و صوت آماده است → هزینهٔ TTS حذف می‌شود
--
--  ساختار سه‌سطحی (هم‌شکل با منبع):
--    lexicon_words   ← سرلغت (تلفظ، خانوادهٔ واژه، کمینهٔ سطح)
--      lexicon_entries ← مدخل (نقش دستوری، سطح، بسامد، اصطلاحات)
--        lexicon_senses  ← معنی (تعریف، ترجمهٔ فارسی، مثال‌ها، هم‌نشینی)
-- ═══════════════════════════════════════════════════════════════════════

-- جست‌وجوی سریع زیررشته و فازی روی واژه
create extension if not exists "pg_trgm";

-- ── ۱. سرلغت ─────────────────────────────────────────────────────────
create table if not exists public.lexicon_words (
  id            uuid primary key default gen_random_uuid(),

  /** زبان واژه (زبان مقصد) — مثلاً 'en' */
  language      text not null default 'en',
  word          text not null,
  /** شکل نرمال‌شده برای تطبیق: کوچک، بدون فاصلهٔ اضافه */
  word_norm     text not null,

  ipa_uk        text,
  ipa_us        text,
  audio_uk      text,
  audio_us      text,

  /** خانوادهٔ واژه: {"noun":["can","cans"], "verb":[...]} */
  word_family   jsonb not null default '{}'::jsonb,

  /** کمترین سطح CEFR در بین معانی — برای انتخاب سریع واژه */
  cefr_min      text,
  /** نقش‌های دستوری موجود: {noun,verb,adjective,…} */
  pos_list      text[] not null default '{}',
  sense_count   int not null default 0,
  /** آیا حداقل یک معنی ترجمهٔ فارسی دارد؟ */
  has_fa        boolean not null default false,

  source        text not null default 'LONGMAN3000',
  created_at    timestamptz not null default now(),

  unique (language, word_norm)
);

create index if not exists idx_lexicon_words_norm
  on public.lexicon_words (language, word_norm);

create index if not exists idx_lexicon_words_trgm
  on public.lexicon_words using gin (word_norm gin_trgm_ops);

create index if not exists idx_lexicon_words_cefr
  on public.lexicon_words (language, cefr_min);

-- ── ۲. مدخل ──────────────────────────────────────────────────────────
create table if not exists public.lexicon_entries (
  id                uuid primary key default gen_random_uuid(),
  word_id           uuid not null references public.lexicon_words (id) on delete cascade,

  entry_number      int not null,
  part_of_speech    text,
  cefr_level        text,
  /** بسامد در گفتار/نوشتار: S1..S3 / W1..W3 */
  frequency_spoken  text,
  frequency_written text,
  grammar_notes     text,
  /** اصطلاحات این مدخل: [{phrase,register,definition_en,translation,example}] */
  idioms            jsonb not null default '[]'::jsonb,

  unique (word_id, entry_number)
);

create index if not exists idx_lexicon_entries_word
  on public.lexicon_entries (word_id);

create index if not exists idx_lexicon_entries_pos
  on public.lexicon_entries (part_of_speech, cefr_level);

-- ── ۳. معنی ──────────────────────────────────────────────────────────
create table if not exists public.lexicon_senses (
  id                    uuid primary key default gen_random_uuid(),
  entry_id              uuid not null references public.lexicon_entries (id) on delete cascade,

  sense_number          int not null,
  /** برچسب کوتاه معنی مثل "ability" — برای تفکیک معانی هم‌ریشه */
  signpost              text,
  signpost_translation  text,
  register              text,
  definition_en         text,
  grammar_pattern       text,
  crossref              text,

  /** ترجمهٔ فارسی — منبع اصلی برای کارت واژه */
  meaning_fa            text,

  synonyms              text[] not null default '{}',
  antonyms              text[] not null default '{}',
  collocations          text[] not null default '{}',

  /** مثال‌ها: [{sentence, translation, audio_url}] */
  examples              jsonb not null default '[]'::jsonb,
  example_count         int not null default 0,

  unique (entry_id, sense_number)
);

create index if not exists idx_lexicon_senses_entry
  on public.lexicon_senses (entry_id);

create index if not exists idx_lexicon_senses_fa
  on public.lexicon_senses (meaning_fa) where meaning_fa is not null;

-- ── ۴. نمای جست‌وجوی تخت ─────────────────────────────────────────────
-- مصرف‌کنندهٔ اصلی: انتخاب واژه برای درس و ساخت کارت واژه.
-- یک ردیف برای هر «معنی» با بهترین مثالش.
create or replace view public.lexicon_lookup as
select
  w.id                as word_id,
  w.language,
  w.word,
  w.word_norm,
  w.ipa_uk,
  w.ipa_us,
  w.audio_uk,
  w.audio_us,
  w.cefr_min,
  e.id                as entry_id,
  e.entry_number,
  e.part_of_speech,
  e.cefr_level,
  e.frequency_spoken,
  e.frequency_written,
  s.id                as sense_id,
  s.sense_number,
  s.signpost,
  s.meaning_fa,
  s.definition_en,
  s.grammar_pattern,
  s.synonyms,
  s.antonyms,
  s.collocations,
  s.example_count,
  (s.examples -> 0 ->> 'sentence')      as example,
  (s.examples -> 0 ->> 'translation')   as example_translation,
  (s.examples -> 0 ->> 'audio_url')     as example_audio
from public.lexicon_words w
join public.lexicon_entries e on e.word_id = w.id
join public.lexicon_senses  s on s.entry_id = e.id;

comment on view public.lexicon_lookup is
  'نمای تخت واژه برای انتخاب محتوا — یک ردیف به‌ازای هر معنی';

-- ── ۵. پرشدن کارت واژه از فرهنگ ──────────────────────────────────────
/**
 * معانی موجود را به `term_cards` منتقل می‌کند تا موتور درس بدون فراخوانی
 * AI جزئیات واژه را از دیتابیس بگیرد.
 *
 * ⚠️ فقط معانی‌ای که ترجمهٔ فارسی دارند و حداقل یک مثال دارند وارد می‌شوند
 * — کارت بی‌مثال برای آموزش بی‌فایده است.
 * ⚠️ `on conflict do nothing` تا کارت‌های دست‌ساز/بهتر بازنویسی نشوند.
 */
create or replace function public.seed_term_cards_from_lexicon(
  p_language text default 'en',
  p_ui_language text default 'fa',
  p_max_per_word int default 1
)
returns integer
language plpgsql
as $$
declare
  v_inserted integer := 0;
begin
  with ranked as (
    select
      l.word_norm,
      l.meaning_fa,
      l.example,
      l.example_translation,
      coalesce(l.ipa_us, l.ipa_uk) as pronunciation,
      row_number() over (
        partition by l.word_norm
        order by
          case l.cefr_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3
                            when 'B2' then 4 when 'C1' then 5 else 9 end,
          l.sense_number
      ) as rn
    from public.lexicon_lookup l
    where l.language = p_language
      and l.meaning_fa is not null
      and length(btrim(l.meaning_fa)) > 0
      and l.example is not null
      and length(btrim(l.example)) > 0
  )
  insert into public.term_cards
    (term, language, ui_language, meaning, pronunciation, example, example_translation)
  select
    r.word_norm, p_language, p_ui_language, r.meaning_fa,
    r.pronunciation, r.example, r.example_translation
  from ranked r
  where r.rn <= greatest(1, p_max_per_word)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.seed_term_cards_from_lexicon is
  'انتقال معانی فرهنگ به term_cards — حذف هزینهٔ AI برای واژه‌های موجود';

-- ── ۶. RLS ───────────────────────────────────────────────────────────
-- فرهنگ، دادهٔ عمومی و فقط‌خواندنی است. نوشتن فقط با service_role.
alter table public.lexicon_words   enable row level security;
alter table public.lexicon_entries enable row level security;
alter table public.lexicon_senses  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'lexicon_words_read') then
    create policy lexicon_words_read on public.lexicon_words
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'lexicon_entries_read') then
    create policy lexicon_entries_read on public.lexicon_entries
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'lexicon_senses_read') then
    create policy lexicon_senses_read on public.lexicon_senses
      for select to anon, authenticated using (true);
  end if;
end $$;
