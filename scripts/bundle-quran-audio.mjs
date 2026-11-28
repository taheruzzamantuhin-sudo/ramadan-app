// কুরআন অডিও বান্ডল প্রস্তুতি — বিল্ডের ধাপ (package.json: build:client)।
//
// পুরো কুরআনের প্রতি-আয়াত তিলাওয়াত (মিশারি আল-আফাসি, Islamic Network
// CDN-এর 64 kbps MP3) নামিয়ে ffmpeg দিয়ে Opus mono 12 kbps-এ ট্রান্সকোড
// করে ওয়েব বান্ডলের পাশে client/dist/quran-audio/<g>.opus হিসেবে বসায়,
// যাতে Android অ্যাপে ইনস্টলের পর থেকেই কোনো ডাউনলোড ছাড়া সব ১১৪ সূরা
// অফলাইনে শোনা যায়। মোট ৬২৩৬টি ফাইল, আনুমানিক ১৬৪ MB।
//
// ক্যাশ: client/.quran-audio-cache/{mp3,opus} — আগের রানের ফাইল থাকলে
// সেগুলো আবার নামানো/বানানো হয় না (resume)। CI-তে ক্যাশ থাকে না, তাই
// প্রতিটা CI বিল্ডে পুরো প্রক্রিয়াটা নতুন করে চলে — ফল একই থাকে।

import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "client", ".quran-audio-cache");
const SRC_DIR = path.join(CACHE, "mp3");
const OUT_DIR = path.join(CACHE, "opus");
const TOTAL = 6236;
const DL_JOBS = Number(process.env.QURAN_DL_JOBS || 10);
const ENC_JOBS = Number(process.env.QURAN_ENC_JOBS || 4);

const cdnUrl = (g) =>
  `https://cdn.islamic.network/quran/audio/64/ar.alafasy/${g}.mp3`;
// Some CDN edges throttle unfamiliar user agents / datacenter IPs; a
// browser UA keeps the requests looking like ordinary app traffic.
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Amolkhata) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d;
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`)),
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Failure-collecting pool: a worker error NEVER rejects the pool — the
// failed items are returned so main() can retry them in later passes.
// (The first CI run with this script died a few minutes in because one
// rejected worker promise killed Promise.all and with it the build.)
async function pool(items, jobs, worker, label) {
  let idx = 0;
  let done = 0;
  let lastLog = 0;
  const failed = [];
  async function lane() {
    while (idx < items.length) {
      const item = items[idx++];
      try {
        await worker(item);
      } catch (e) {
        failed.push(item);
        if (failed.length <= 5) {
          console.warn(`[quran-audio] ${label}: item ${item} failed (${e.message})`);
        }
      }
      done++;
      if (done - lastLog >= 500 || done === items.length) {
        lastLog = done;
        console.log(`[quran-audio] ${label}: ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(jobs, items.length) }, () => lane()),
  );
  return failed;
}

async function downloadOne(g) {
  const dest = path.join(SRC_DIR, `${g}.mp3`);
  if (existsSync(dest) && statSync(dest).size > 1000) return;
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(cdnUrl(g), { headers: FETCH_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length <= 1000) throw new Error(`too small: ${buf.length}`);
      const tmp = `${dest}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, dest);
      return;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`download ${g} failed: ${lastErr}`);
}

async function encodeOne(g) {
  const src = path.join(SRC_DIR, `${g}.mp3`);
  const dest = path.join(OUT_DIR, `${g}.opus`);
  if (existsSync(dest) && statSync(dest).size > 500) return;
  const tmp = `${dest}.tmp.opus`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await run("ffmpeg", [
        "-v", "error",
        "-y",
        "-i", src,
        "-ac", "1",
        "-c:a", "libopus",
        "-b:a", "12k",
        "-vbr", "off",
        "-application", "voip",
        tmp,
      ]);
      if (!existsSync(tmp) || statSync(tmp).size <= 500) {
        throw new Error("encode produced no/short output");
      }
      renameSync(tmp, dest);
      return;
    } catch (e) {
      lastErr = e;
      await sleep(300 * attempt);
    }
  }
  throw new Error(`encode ${g} failed: ${lastErr}`);
}

async function main() {
  if (process.env.QURAN_AUDIO_SKIP === "1") {
    console.log("[quran-audio] skipped (QURAN_AUDIO_SKIP=1)");
    return;
  }
  mkdirSync(SRC_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const all = Array.from({ length: TOTAL }, (_, i) => i + 1);

  console.log("[quran-audio] downloading MP3s…");
  let pending = all;
  for (let pass = 1; pass <= 4 && pending.length > 0; pass++) {
    if (pass > 1) {
      const wait = 5000 * pass;
      console.log(
        `[quran-audio] download retry pass ${pass}: ${pending.length} left, waiting ${wait / 1000}s`,
      );
      await sleep(wait);
    }
    pending = await pool(pending, DL_JOBS, downloadOne, `download pass ${pass}`);
  }
  if (pending.length > 0) {
    throw new Error(
      `[quran-audio] downloads incomplete: ${pending.length} missing, e.g. ${pending.slice(0, 10).join(",")}`,
    );
  }

  console.log("[quran-audio] transcoding to Opus 12 kbps…");
  pending = all;
  for (let pass = 1; pass <= 3 && pending.length > 0; pass++) {
    if (pass > 1) {
      console.log(
        `[quran-audio] transcode retry pass ${pass}: ${pending.length} left`,
      );
      await sleep(2000);
    }
    pending = await pool(pending, ENC_JOBS, encodeOne, `transcode pass ${pass}`);
  }
  if (pending.length > 0) {
    throw new Error(
      `[quran-audio] transcodes incomplete: ${pending.length} missing, e.g. ${pending.slice(0, 10).join(",")}`,
    );
  }

  // ----- verify -----
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".opus"));
  if (files.length !== TOTAL) {
    throw new Error(
      `[quran-audio] expected ${TOTAL} opus files, found ${files.length}`,
    );
  }
  let totalBytes = 0;
  for (const f of files) totalBytes += statSync(path.join(OUT_DIR, f)).size;
  console.log(
    `[quran-audio] verified: ${files.length} files, ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MiB total`,
  );

  // ----- copy into built web bundle(s) -----
  const distCandidates = [
    path.join(ROOT, "client", "dist"),
    path.join(ROOT, "client", "dist-cvm"),
  ];
  const targets = distCandidates.filter((d) => existsSync(d));
  if (targets.length === 0) {
    console.log(
      "[quran-audio] no dist folder found — audio stays in cache only",
    );
    return;
  }
  for (const dist of targets) {
    const destDir = path.join(dist, "quran-audio");
    mkdirSync(destDir, { recursive: true });
    for (const f of files) {
      copyFileSync(path.join(OUT_DIR, f), path.join(destDir, f));
    }
    console.log(`[quran-audio] copied ${files.length} files -> ${destDir}`);
  }
}

main().catch((e) => {
  console.error(`[quran-audio] FAILED: ${e.message || e}`);
  process.exit(1);
});
