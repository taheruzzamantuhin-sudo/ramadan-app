// আল-কুরআন ডেটা লোডার + অডিও ম্যানেজার।
//
// ডেটা (আলাদাভাবে তৈরি):
//   ./quran/meta.ts          — SURAHS / PARAS মেটাডেটা
//   ./quran/surah-<n>.json   — প্রতি সূরার আরবি + বাংলা অর্থ + উচ্চারণ
//
// অডিও: প্রতি আয়াতের তিলাওয়াত (মিশারি আল-আফাসি) অ্যাপের ভেতরেই বান্ডল
// করা থাকে — বিল্ডের সময় scripts/bundle-quran-audio.mjs CDN-এর 64 kbps
// MP3 নামিয়ে Opus mono 12 kbps-এ ট্রান্সকোড করে বান্ডলে
// quran-audio/<g>.opus (মোট ৬২৩৬ ফাইল, ~১৬৪ MB) হিসেবে বসায়। তাই সূরা
// অনুযায়ী শুনলে ইনস্টলের পর থেকেই কোনো ডাউনলোড ছাড়া অফলাইনে চলে।
// পারা অনুযায়ী শোনা আগের মতোই Islamic Network CDN থেকে স্ট্রিম হয়।

import { PARAS, SURAHS } from "./quran/meta";
import { SURAH_LOADERS } from "./quran/loaders";

// ---------- types ----------

export interface SurahMeta {
  n: number;
  bn: string;
  en: string;
  ayahs: number;
  type: string;
}

export interface ParaMeta {
  para: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export interface QuranAyah {
  /** সূরার ভেতরে আয়াত নম্বর (১ থেকে) */
  i: number;
  /** পুরো কুরআনে গ্লোবাল আয়াত নম্বর (১–৬২৩৬) — অডিও URL-এর চাবি */
  g: number;
  /** পারা (juz) নম্বর */
  j: number;
  ar: string;
  bn: string;
  /** বাংলা উচ্চারণ; খালি স্ট্রিং হতে পারে */
  pr: string;
}

export interface SurahData {
  n: number;
  bismillah: string | null;
  ayahs: QuranAyah[];
}

/** loadPara-এর প্রতি আয়াত — কোন সূরার তা surah ফিল্ডে যোগ করা থাকে। */
export interface ParaAyah extends QuranAyah {
  surah: number;
}

export { PARAS, SURAHS };

// ---------- surah / para loading ----------

const surahCache = new Map<number, SurahData>();

/**
 * একটি সূরার পুরো ডেটা লোড করে (dynamic import — প্রতিটা JSON আলাদা
 * চাংক হিসেবে আসে, তাই পুরো কুরআন একবারে ডাউনলোড হয় না)। লোড হওয়া
 * সূরা মেমরিতে ক্যাশ থাকে।
 */
export async function loadSurah(n: number): Promise<SurahData> {
  const cached = surahCache.get(n);
  if (cached) return cached;
  const loader = SURAH_LOADERS[n];
  if (!loader) throw new Error(`সূরা ${n} পাওয়া যায়নি`);
  const mod = (await loader()) as { default: SurahData };
  const data = mod.default;
  surahCache.set(n, data);
  return data;
}

/**
 * একটি পারার সব আয়াত ক্রমানুসারে ফেরত দেয়। PARAS মেটা থেকে ওই পারা
 * যেসব সূরা জুড়ে আছে সেগুলো লোড করে juz == para আয়াতগুলো বেছে নেয়;
 * প্রতি আয়াতে তার সূরা নম্বর (surah) যোগ থাকে।
 */
export async function loadPara(para: number): Promise<ParaAyah[]> {
  const meta = PARAS.find((p) => p.para === para);
  if (!meta) return [];
  const out: ParaAyah[] = [];
  for (let s = meta.startSurah; s <= meta.endSurah; s++) {
    const surah = await loadSurah(s);
    for (const a of surah.ayahs) {
      if (a.j === para) out.push({ ...a, surah: s });
    }
  }
  out.sort((a, b) => a.g - b.g);
  return out;
}

// ---------- audio streaming ----------

/** গ্লোবাল আয়াত নম্বর থেকে স্ট্রিমিং MP3 URL (আল-আফাসি, 64kbps)। */
export function audioUrl(g: number): string {
  return `https://cdn.islamic.network/quran/audio/64/ar.alafasy/${g}.mp3`;
}


/**
 * গ্লোবাল আয়াত নম্বর থেকে অ্যাপে বান্ডল করা লোকাল অডিওর পথ
 * (Opus mono 12 kbps — বিল্ডের সময় বান্ডলে বসানো, দেখুন
 * scripts/bundle-quran-audio.mjs)। আপেক্ষিক পথ: ওয়েব বান্ডলের রুট
 * থেকে quran-audio/ ফোল্ডারে থাকে, Capacitor শেল ও ওয়েব দুটোতেই
 * একইভাবে পাওয়া যায়। ইন্টারনেট ছাড়াই চলে।
 */
export function bundledAudioUrl(g: number): string {
  return `quran-audio/${g}.opus`;
}
