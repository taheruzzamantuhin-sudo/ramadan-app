// আল-কুরআন ডেটা লোডার + অডিও স্ট্রিম/ডাউনলোড ম্যানেজার।
//
// ডেটা (আলাদাভাবে তৈরি):
//   ./quran/meta.ts          — SURAHS / PARAS মেটাডেটা
//   ./quran/surah-<n>.json   — প্রতি সূরার আরবি + বাংলা অর্থ + উচ্চারণ
//
// অডিও: প্রতি আয়াতের MP3 (মিশারি আল-আফাসি তিলাওয়াত) Islamic Network
// CDN থেকে স্ট্রিম হয়। নেটিভ অ্যাপে (Capacitor) পুরো সূরা ডাউনলোড করে
// অফলাইনে শোনা যায় — ফাইল থাকে Directory.Data/quran-audio/<surah>/<g>.mp3
// পথে, আর কোন সূরা কতটুকু ডাউনলোড হয়েছে তার হিসাব localStorage-এর
// manifest-এ থাকে। ওয়েবে ডাউনলোড ফাংশনগুলো নিরাপদ no-op।

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
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

export interface DownloadInfo {
  total: number;
  done: number;
  complete: boolean;
}

export type DownloadManifest = Record<number, DownloadInfo>;

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

// ---------- offline downloads (native only) ----------

const MANIFEST_KEY = "amolkhata.quran.downloads";
const AUDIO_DIR = "quran-audio";

/** Capacitor নেটিভ শেলের (Android অ্যাপ) ভেতরে চলছে কিনা। */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function readManifest(): DownloadManifest {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DownloadManifest;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeManifest(manifest: DownloadManifest): void {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // storage unavailable / full — download state just won't persist
  }
}

/** এক সূরার ডাউনলোড অবস্থা (manifest থেকে); কিছু না থাকলে null। */
export function downloadInfo(surah: number): DownloadInfo | null {
  return readManifest()[surah] ?? null;
}

/** পুরোপুরি ডাউনলোড হয়ে থাকা সূরাগুলোর সেট। */
export function downloadedSurahs(): Set<number> {
  const out = new Set<number>();
  const manifest = readManifest();
  for (const key of Object.keys(manifest)) {
    const info = manifest[Number(key)];
    if (info?.complete) out.add(Number(key));
  }
  return out;
}

function audioPath(surah: number, g: number): string {
  return `${AUDIO_DIR}/${surah}/${g}.mp3`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

/**
 * একটি সূরার সব আয়াতের MP3 ডিভাইসে ডাউনলোড করে। আগেরবার আংশিক
 * ডাউনলোড হয়ে থাকলে যেসব ফাইল ইতিমধ্যে আছে সেগুলো skip করে বাকিগুলো
 * আনে (resume)। অগ্রগতি onProgress(done, total) দিয়ে জানানো হয়।
 * সফলভাবে সব নামলে true, নইলে false। ওয়েবে (নেটিভ নয়) false ফেরত
 * দিয়ে no-op থাকে।
 */
export async function downloadSurah(
  surah: number,
  onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  if (!isNative()) return false;
  let data: SurahData;
  try {
    data = await loadSurah(surah);
  } catch {
    return false;
  }
  const total = data.ayahs.length;
  let done = 0;
  let failed = false;

  const save = (complete: boolean) => {
    const manifest = readManifest();
    manifest[surah] = { total, done, complete };
    writeManifest(manifest);
  };
  save(false);
  onProgress?.(done, total);

  for (const ayah of data.ayahs) {
    const path = audioPath(surah, ayah.g);
    if (await fileExists(path)) {
      done++;
    } else {
      try {
        await Filesystem.downloadFile({
          url: audioUrl(ayah.g),
          path,
          directory: Directory.Data,
        });
        done++;
      } catch {
        failed = true;
      }
    }
    save(!failed && done === total);
    onProgress?.(done, total);
  }
  const complete = !failed && done === total;
  save(complete);
  return complete;
}

/**
 * ডাউনলোড করা আয়াতের লোকাল ফাইল URL (ওয়েবভিউতে চালানোর উপযোগী)।
 * ফাইল না থাকলে বা ওয়েবে হলে null।
 */
export async function getLocalUri(
  surah: number,
  g: number,
): Promise<string | null> {
  if (!isNative()) return null;
  const path = audioPath(surah, g);
  if (!(await fileExists(path))) return null;
  try {
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Data,
    });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

/** এক সূরার ডাউনলোড করা সব অডিও মুছে manifest আপডেট করে। */
export async function deleteSurahDownload(surah: number): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Filesystem.rmdir({
      path: `${AUDIO_DIR}/${surah}`,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // folder may not exist — still clear the manifest entry below
  }
  const manifest = readManifest();
  delete manifest[surah];
  writeManifest(manifest);
  return true;
}
