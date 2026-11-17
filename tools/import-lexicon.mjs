#!/usr/bin/env node
/**
 * import-lexicon.mjs — درج فرهنگ واژگان در Supabase از طریق REST.
 *
 * چرا REST و نه SQL؟
 * ──────────────────
 * فایل‌های SQL تولیدشده در مجموع ~۲۷ مگابایت‌اند و چند فایل تکی از ۲ مگابایت
 * بیشتر است. SQL Editor داشبورد Supabase برای این حجم مناسب نیست (تایم‌اوت
 * می‌دهد). REST با batch های کوچک، قابل تکرار و بی‌خطر است.
 *
 * استفاده:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node tools/import-lexicon.mjs --input "C:/.../longman3000.json"
 *
 * ⚠️ service_role کلید را هرگز کامیت نکنید و فقط در محیط محلی استفاده کنید.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const INPUT = argOf('input', 'C:/Users/Akoul/Desktop/Longman3000_JSON/longman3000.json');
const BATCH = Number(argOf('batch', '200'));
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error('SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY لازم است.');
  process.exit(1);
}

/** UUID قطعی — هم‌خوان با tools/build-lexicon-sql.mjs */
function detUuid(key) {
  const h = crypto.createHash('sha1').update(key).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const norm = (w) => String(w ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const CEFR = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${table}: ${res.status} ${text.slice(0, 300)}`);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const words = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
console.log(`منبع: ${words.length} سرلغت`);

let wordRows = [];
let entryRows = [];
let senseRows = [];

async function flush() {
  await upsert('lexicon_words', wordRows, 'language,word_norm');
  await upsert('lexicon_entries', entryRows, 'word_id,entry_number');
  await upsert('lexicon_senses', senseRows, 'entry_id,sense_number');
  wordRows = [];
  entryRows = [];
  senseRows = [];
}

let done = 0;
for (const w of words) {
  const wordNorm = norm(w.word);
  const entries = Array.isArray(w.entries) ? w.entries : [];
  if (!wordNorm || entries.length === 0) continue;

  const wordId = detUuid(`word:en:${wordNorm}`);
  let cefrMin = null;
  const posSet = new Set();
  let senseCount = 0;
  let hasFa = false;

  for (const e of entries) {
    const entryNumber = Number(e.entry_number) || 1;
    const entryId = detUuid(`entry:en:${wordNorm}:${entryNumber}`);
    if (e.part_of_speech) posSet.add(String(e.part_of_speech));

    const cefr = e.cefr_level ? String(e.cefr_level).toUpperCase() : null;
    if (cefr && CEFR[cefr] && (!cefrMin || CEFR[cefr] < CEFR[cefrMin])) cefrMin = cefr;

    for (const s of e.senses ?? []) {
      const senseNumber = Number(s.sense_number) || 1;
      const fa = (s.translations ?? []).find(
        (t) => t?.target_language === 'fa' && t.meaning && String(t.meaning).trim()
      );
      if (fa) hasFa = true;

      const examples = (s.examples ?? [])
        .filter((ex) => ex?.sentence && String(ex.sentence).trim())
        .map((ex) => ({
          sentence: String(ex.sentence).trim(),
          translation: ex.translation ? String(ex.translation).trim() : null,
          audio_url: ex.audio_url ? String(ex.audio_url).trim() : null,
        }));

      senseCount += 1;
      senseRows.push({
        id: detUuid(`sense:en:${wordNorm}:${entryNumber}:${senseNumber}`),
        entry_id: entryId,
        sense_number: senseNumber,
        signpost: s.signpost || null,
        signpost_translation: s.signpost_translation || null,
        register: s.register || null,
        definition_en: s.definition_en || null,
        grammar_pattern: s.grammar_pattern || null,
        crossref: s.crossref || null,
        meaning_fa: fa ? String(fa.meaning).trim() : null,
        synonyms: (s.synonyms ?? []).filter(Boolean),
        antonyms: (s.antonyms ?? []).filter(Boolean),
        collocations: (s.collocations ?? []).filter(Boolean),
        examples,
        example_count: examples.length,
      });
    }

    entryRows.push({
      id: entryId,
      word_id: wordId,
      entry_number: entryNumber,
      part_of_speech: e.part_of_speech || null,
      cefr_level: cefr,
      frequency_spoken: e.frequency?.spoken ?? null,
      frequency_written: e.frequency?.written ?? null,
      grammar_notes: e.grammar_notes || null,
      idioms: Array.isArray(e.idioms) ? e.idioms : [],
    });
  }

  if (senseCount === 0) continue;

  wordRows.push({
    id: wordId,
    language: 'en',
    word: w.word,
    word_norm: wordNorm,
    ipa_uk: w.pronunciations?.uk?.ipa ?? null,
    ipa_us: w.pronunciations?.us?.ipa ?? null,
    audio_uk: w.pronunciations?.uk?.audio_url ?? null,
    audio_us: w.pronunciations?.us?.audio_url ?? null,
    word_family: w.word_family ?? {},
    cefr_min: cefrMin,
    pos_list: [...posSet],
    sense_count: senseCount,
    has_fa: hasFa,
  });

  done += 1;
  if (wordRows.length >= BATCH) {
    await flush();
    process.stdout.write(`\r${done}/${words.length}`);
  }
}

await flush();
console.log(`\n✓ ${done} سرلغت درج شد.`);

// انتقال به کارت واژه — صفر هزینهٔ AI برای این واژه‌ها
const res = await fetch(`${URL_BASE}/rest/v1/rpc/seed_term_cards_from_lexicon`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ p_language: 'en', p_ui_language: 'fa', p_max_per_word: 1 }),
});
console.log(
  res.ok
    ? `✓ term_cards ساخته شد: ${await res.text()}`
    : `⚠️ ساخت term_cards شکست خورد: ${res.status} ${(await res.text()).slice(0, 200)}`
);
