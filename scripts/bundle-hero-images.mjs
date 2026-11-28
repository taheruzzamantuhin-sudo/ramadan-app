// হিরো স্লাইডশোর মসজিদের ছবি বান্ডল প্রস্তুতি — বিল্ডের ধাপ (package.json: build:client)।
//
// হোম হিরোর পেছনে ঘূর্ণায়মান ৭টি বিখ্যাত মসজিদের আসল ছবি (Wikimedia
// Commons-এর ফ্রি-লাইসেন্স ফটোগ্রাফ, WebP-তে সংকুচিত, মোট ~১.১ MB)
// Cloudflare Pages মিরর (amolkhata-audio.pages.dev/mosques/) থেকে নামিয়ে
// ওয়েব বান্ডলের পাশে client/dist/mosques/<name>.webp হিসেবে বসায় —
// কুরআন অডিওর (bundle-quran-audio.mjs) মতোই একই পদ্ধতি, কারণ GitHub
// রিপোতে বাইনারি ছবি সরাসরি রাখা যায় না (push শুধু টেক্সট ফাইলের)।
//
// কোনো ছবি নামাতে ব্যর্থ হলে বিল্ড থামে না — শুধু সতর্কবার্তা ছাপে।
// অ্যাপের স্লাইডশো নিজেই এমনভাবে বানানো যে অনুপস্থিত ছবি ঘূর্ণন থেকে
// বাদ পড়ে যায়, আর প্রথম ছবি (বান্ডলে থাকা mosque-dusk) সবসময় থাকে।

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE =
  process.env.HERO_IMAGES_BASE_URL ||
  "https://amolkhata-audio.pages.dev/mosques";
const NAMES = [
  "kaaba",
  "nabawi",
  "dome-of-rock",
  "blue-mosque",
  "sheikh-zayed",
  "hagia-sophia",
  "putra",
];
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Amolkhata) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(name, destDir) {
  const dest = path.join(destDir, `${name}.webp`);
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/${name}.webp`, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // WebP-এর স্বাক্ষর: "RIFF"...."WEBP" — ভুল/খালি ফাইল ধরা পড়বে।
      const isWebp =
        buf.length > 20000 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      if (!isWebp) throw new Error(`not a WebP / too small: ${buf.length} bytes`);
      const tmp = `${dest}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, dest);
      return buf.length;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

async function main() {
  if (process.env.HERO_IMAGES_SKIP === "1") {
    console.log("[hero-images] skipped (HERO_IMAGES_SKIP=1)");
    return;
  }
  const distCandidates = [
    path.join(ROOT, "client", "dist"),
    path.join(ROOT, "client", "dist-cvm"),
  ];
  const targets = distCandidates.filter((d) => existsSync(d));
  if (targets.length === 0) {
    console.warn("[hero-images] no dist folder found — skipping");
    return;
  }
  for (const dist of targets) {
    mkdirSync(path.join(dist, "mosques"), { recursive: true });
  }
  let okCount = 0;
  for (const name of NAMES) {
    try {
      const size = await fetchOne(name, path.join(targets[0], "mosques"));
      for (const extra of targets.slice(1)) {
        await fetchOne(name, path.join(extra, "mosques")).catch(() => 0);
      }
      okCount++;
      console.log(`[hero-images] ${name}.webp — ${(size / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.warn(`[hero-images] WARNING: ${name}.webp failed (${e}) — slideshow will skip it`);
    }
  }
  console.log(`[hero-images] done: ${okCount}/${NAMES.length} images bundled`);
}

await main();
