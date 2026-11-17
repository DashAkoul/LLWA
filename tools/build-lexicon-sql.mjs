#!/usr/bin/env node
/**
 * build-lexicon-sql.mjs — تولید SQL دیتابیس واژگان از فایل Longman.
 *
 * چرا اسکریپت و نه SQL دستی؟
 * ─────────────────────────
 * منبع ۳۱٬۵۹۹ واژه/مدخل/معنی دارد. نوشتن دستی غیرممکن است و هر تغییر در
 * منبع باید دوباره تولید شود، نه اینکه وصله بخورد.
 *
 * طراحی خروجی:
 *   • هر فایل `part-NNN.sql` **خودکفا** است: واژه‌ها + مدخل‌ها + معانی همان
 *     دسته. پس ترتیب اجرا مهم نیست و اگر یکی شکست بخورد بقیه سالم‌اند.
 *   • شناسه‌ها **قطعی** ساخته می‌شوند (UUID از هش کلید منطقی) تا مدخل‌ها
 *     بتوانند بدون subquery به والد ارجاع دهند — درج ۶۰ هزار ردیف را از
 *     چند دقیقه به چند ثانیه می‌رساند.
 *   • `on conflict do nothing` → اجرای دوباره بی‌خطر است (idempotent).
 *
 * استفاده:
 *   node tools/build-lexicon-sql.mjs \
 *     --input "C:/Users/Akoul/Desktop/Longman3000_JSON/longman3000.json" \
 *     --out   supabase/seed/lexicon
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── آرگومان‌ها ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const INPUT = argOf('input', 'C:/Users/Akoul/Desktop/Longman3000_JSON/longman3000.json');
const OUT_DIR = argOf('out', 'supabase/seed/lexicon');
const WORDS_PER_FILE = Number(argOf('chunk', '150'));

// ── ابزارها ───────────────────────────────────────────────────────────

/** UUID قطعی از یک کلید منطقی (شکل v5، بدون وابستگی بیرونی) */
function detUuid(key) {
  const h = crypto.createHash('sha1').update(key).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** رشتهٔ SQL — نقل‌قول تک‌گانه دوبل می‌شود (standard_conforming_strings) */
function q(value) {
  if (value === null || value === undefined) return 'null';
  const s = String(value).replace(/\u0000/g, '');
  if (s.length === 0) return 'null';
  return `'${s.replace(/'/g, "''")}'`;
}

/** آرایهٔ متنی */
function arr(values) {
  if (!Array.isArray(values) || values.length === 0) return `'{}'::text[]`;
  const items = values
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter((v) => v.length > 0)
    .map((v) => `'${v.replace(/'/g, "''")}'`);
  return items.length ? `array[${items.join(',')}]::text[]` : `'{}'::text[]`;
}

/** jsonb */
function jsonb(value) {
  const text = JSON.stringify(value ?? null);
  return `'${text.replace(/'/g, "''")}'::jsonb`;
}

const CEFR_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

function normWord(w) {
  return String(w ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── خواندن منبع ───────────────────────────────────────────────────────
const raw = fs.readFileSync(INPUT, 'utf8');
const words = JSON.parse(raw);
if (!Array.isArray(words) || words.length === 0) {
  throw new Error('input JSON must be a non-empty array');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
// پاک‌سازی خروجی قبلی تا فایل یتیم نماند
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/^part-\d+\.sql$/.test(f) || f === '99_seed_term_cards.sql') {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
}

let totalWords = 0;
let totalEntries = 0;
let totalSenses = 0;
let totalExamples = 0;
let totalWithFa = 0;
let skipped = 0;

const chunks = [];
for (let i = 0; i < words.length; i += WORDS_PER_FILE) {
  chunks.push(words.slice(i, i + WORDS_PER_FILE));
}

chunks.forEach((chunk, index) => {
  const wordRows = [];
  const entryRows = [];
  const senseRows = [];

  for (const w of chunk) {
    const wordNorm = normWord(w.word);
    if (!wordNorm) {
      skipped += 1;
      continue;
    }

    const entries = Array.isArray(w.entries) ? w.entries : [];
    if (entries.length === 0) {
      skipped += 1;
      continue;
    }

    const wordId = detUuid(`word:en:${wordNorm}`);

    // آمار سرلغت
    let cefrMin = null;
    const posSet = new Set();
    let senseCount = 0;
    let hasFa = false;

    const preparedEntries = [];
    const preparedSenses = [];

    for (const e of entries) {
      const entryNumber = Number(e.entry_number) || 1;
      const entryId = detUuid(`entry:en:${wordNorm}:${entryNumber}`);
      if (e.part_of_speech) posSet.add(String(e.part_of_speech));

      const cefr = e.cefr_level ? String(e.cefr_level).toUpperCase() : null;
      if (cefr && CEFR_ORDER[cefr]) {
        if (!cefrMin || CEFR_ORDER[cefr] < CEFR_ORDER[cefrMin]) cefrMin = cefr;
      }

      const senses = Array.isArray(e.senses) ? e.senses : [];
      for (const s of senses) {
        const senseNumber = Number(s.sense_number) || 1;
        const senseId = detUuid(`sense:en:${wordNorm}:${entryNumber}:${senseNumber}`);

        const faTranslation = (Array.isArray(s.translations) ? s.translations : []).find(
          (t) => t && t.target_language === 'fa' && t.meaning && String(t.meaning).trim()
        );
        const meaningFa = faTranslation ? String(faTranslation.meaning).trim() : null;
        if (meaningFa) hasFa = true;

        const examples = (Array.isArray(s.examples) ? s.examples : [])
          .filter((ex) => ex && ex.sentence && String(ex.sentence).trim())
          .map((ex) => ({
            sentence: String(ex.sentence).trim(),
            translation: ex.translation ? String(ex.translation).trim() : null,
            audio_url: ex.audio_url ? String(ex.audio_url).trim() : null,
          }));

        senseCount += 1;
        totalExamples += examples.length;

        preparedSenses.push(
          `(${q(senseId)},${q(entryId)},${senseNumber},${q(s.signpost)},${q(
            s.signpost_translation
          )},${q(s.register)},${q(s.definition_en)},${q(s.grammar_pattern)},${q(
            s.crossref
          )},${q(meaningFa)},${arr(s.synonyms)},${arr(s.antonyms)},${arr(
            s.collocations
          )},${jsonb(examples)},${examples.length})`
        );
      }

      preparedEntries.push(
        `(${q(entryId)},${q(wordId)},${entryNumber},${q(e.part_of_speech)},${q(
          cefr
        )},${q(e.frequency?.spoken)},${q(e.frequency?.written)},${q(
          e.grammar_notes
        )},${jsonb(Array.isArray(e.idioms) ? e.idioms : [])})`
      );
    }

    if (senseCount === 0) {
      skipped += 1;
      continue;
    }

    totalWords += 1;
    totalEntries += preparedEntries.length;
    totalSenses += preparedSenses.length;
    if (hasFa) totalWithFa += 1;

    wordRows.push(
      `(${q(wordId)},'en',${q(w.word)},${q(wordNorm)},${q(w.pronunciations?.uk?.ipa)},${q(
        w.pronunciations?.us?.ipa
      )},${q(w.pronunciations?.uk?.audio_url)},${q(
        w.pronunciations?.us?.audio_url
      )},${jsonb(w.word_family ?? {})},${q(cefrMin)},${arr([...posSet])},${senseCount},${hasFa})`
    );

    entryRows.push(...preparedEntries);
    senseRows.push(...preparedSenses);
  }

  if (wordRows.length === 0) return;

  const lines = [];
  lines.push(`-- part-${String(index + 1).padStart(3, '0')} — ${wordRows.length} words`);
  lines.push('begin;');
  lines.push('');
  lines.push(
    'insert into public.lexicon_words\n  (id,language,word,word_norm,ipa_uk,ipa_us,audio_uk,audio_us,word_family,cefr_min,pos_list,sense_count,has_fa)\nvalues'
  );
  lines.push(wordRows.join(',\n') + '\non conflict (language, word_norm) do nothing;');
  lines.push('');
  lines.push(
    'insert into public.lexicon_entries\n  (id,word_id,entry_number,part_of_speech,cefr_level,frequency_spoken,frequency_written,grammar_notes,idioms)\nvalues'
  );
  lines.push(entryRows.join(',\n') + '\non conflict (word_id, entry_number) do nothing;');
  lines.push('');
  lines.push(
    'insert into public.lexicon_senses\n  (id,entry_id,sense_number,signpost,signpost_translation,register,definition_en,grammar_pattern,crossref,meaning_fa,synonyms,antonyms,collocations,examples,example_count)\nvalues'
  );
  lines.push(senseRows.join(',\n') + '\non conflict (entry_id, sense_number) do nothing;');
  lines.push('');
  lines.push('commit;');

  fs.writeFileSync(
    path.join(OUT_DIR, `part-${String(index + 1).padStart(3, '0')}.sql`),
    lines.join('\n')
  );
});

// فایل نهایی: انتقال فرهنگ به کارت واژه
fs.writeFileSync(
  path.join(OUT_DIR, '99_seed_term_cards.sql'),
  `-- 99 — انتقال معانی فرهنگ به term_cards
--
-- ⚠️ این را **بعد از** همهٔ فایل‌های part-* اجرا کنید.
-- نتیجه: موتور درس برای این واژه‌ها دیگر به AI نیاز ندارد.

select public.seed_term_cards_from_lexicon('en', 'fa', 1) as cards_created;
`
);

// مانیفست
const manifest = {
  generatedAt: new Date().toISOString(),
  source: INPUT,
  files: chunks.length,
  words: totalWords,
  entries: totalEntries,
  senses: totalSenses,
  examples: totalExamples,
  wordsWithPersian: totalWithFa,
  skipped,
};
fs.writeFileSync(
  path.join(OUT_DIR, '_manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log(JSON.stringify(manifest, null, 2));
