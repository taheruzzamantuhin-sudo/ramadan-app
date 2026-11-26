// রমজান অ্যাপ — সম্পূর্ণ বাংলা রমজান সহায়িকা।
// জেলা অনুযায়ী সেহরি-ইফতার ও নামাজের সময় (ইসলামিক ফাউন্ডেশনের ১৮° পদ্ধতি),
// লাইভ কাউন্টডাউন, সেহরির অ্যালার্ম, রমজানের ক্যালেন্ডার, রোজা ট্র্যাকার,
// কোরআন খতম প্ল্যান, তসবিহ, দোয়া-হাদিস, যাকাত-ফিতরা ক্যালকুলেটর এবং
// শুধু অ্যাডমিনের জন্য ব্যবহার-পরিসংখ্যান।

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim, setFailureNoticeText } from "@hatch/space-sdk/client";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import { api, type ApiResponse } from "./api";
import type { Actions } from "../../server/src/actions";
import { DISTRICTS, findDistrict } from "./districts";
import { ASHRAS, DHIKRS, DUAS, FITRA_RATES, HADITHS, KHATAM_PLAN, ashraOfDay, hadithTopic } from "./content";
import {
  alreadyFired,
  hadithNotification,
  hadithSlotsForDay,
  markFired,
  notificationPermission,
  requestNotificationPermission,
  showNotification,
} from "./notify";
import {
  cancelAllNative,
  isNativeShell,
  nativeCheckPermission,
  nativeExactAlarmState,
  nativeOpenExactAlarmSettings,
  nativeRequestPermission,
  nativeShowNow,
  syncNativeSchedule,
  type NativePermState,
} from "./native-notify";
import { readCache, writeCache } from "./cache";
import heroImg from "./assets/media-generation-ramadan-hero-0-dc19abcf-fa4f-498d-a1b9-adca3aa3bdef.webp";
import mosqueImg from "./assets/mosque-dusk.jpg";

const FIELDS = actionFields<typeof Actions>();

setFailureNoticeText((error) => {
  const m = error instanceof Error ? error.message : "";
  return m && /[\u0980-\u09FF]/.test(m) ? m : "কিছু সমস্যা হয়েছে — আবার চেষ্টা করুন";
});

type User = ApiResponse<typeof api, "me">["user"] & object;
type DayInfo = ApiResponse<typeof api, "getDayTimings">["day"];

// ---------- Bengali helpers ----------

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function bn(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function ordinalBn(n: number): string {
  const map: Record<number, string> = {
    1: "১ম", 2: "২য়", 3: "৩য়", 4: "৪র্থ", 5: "৫ম",
    6: "৬ষ্ঠ", 7: "৭ম", 8: "৮ম", 9: "৯ম", 10: "১০ম",
  };
  return map[n] ?? `${bn(n)}তম`;
}
function periodOf(h: number): string {
  if (h < 4) return "রাত";
  if (h < 6) return "ভোর";
  if (h < 12) return "সকাল";
  if (h < 15) return "দুপুর";
  if (h < 18) return "বিকাল";
  if (h < 19) return "সন্ধ্যা";
  return "রাত";
}
/** "05:19" -> "ভোর ৫:১৯" */
function fmtTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${periodOf(h)} ${bn(h12)}:${bn(pad2(m))}`;
}
const MONTHS_BN: Record<string, string> = {
  Jan: "জানুয়ারি", Feb: "ফেব্রুয়ারি", Mar: "মার্চ", Apr: "এপ্রিল",
  May: "মে", Jun: "জুন", Jul: "জুলাই", Aug: "আগস্ট",
  Sep: "সেপ্টেম্বর", Oct: "অক্টোবর", Nov: "নভেম্বর", Dec: "ডিসেম্বর",
};
const HIJRI_MONTHS_BN: Record<number, string> = {
  1: "মুহাররম", 2: "সফর", 3: "রবিউল আউয়াল", 4: "রবিউস সানি",
  5: "জুমাদাল উলা", 6: "জুমাদাল আখিরা", 7: "রজব", 8: "শাবান",
  9: "রমজান", 10: "শাওয়াল", 11: "জিলকদ", 12: "জিলহজ",
};
const WEEKDAYS_BN: Record<string, string> = {
  Monday: "সোমবার", Tuesday: "মঙ্গলবার", Wednesday: "বুধবার",
  Thursday: "বৃহস্পতিবার", Friday: "শুক্রবার", Saturday: "শনিবার", Sunday: "রবিবার",
};
/** DayInfo -> "৮ ফেব্রুয়ারি ২০২৭, সোমবার" */
function fmtDateBn(day: DayInfo): string {
  const parts = day.gregorianLabel.split(" "); // "08 Feb 2027"
  const d = parts[0] ?? "";
  const mon = MONTHS_BN[parts[1] ?? ""] ?? parts[1] ?? "";
  const y = parts[2] ?? "";
  const wd = WEEKDAYS_BN[day.weekdayEn] ?? day.weekdayEn;
  return `${bn(Number(d))} ${mon} ${bn(y)}, ${wd}`;
}
function dhakaNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 6 * 3600 * 1000);
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysISO(iso: string, n: number): string {
  const [y = 2027, m = 1, d = 1] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function diffDaysISO(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}
/** Dhaka wall-clock time -> absolute ms */
function timeToMs(iso: string, hhmm: string): number {
  const [y = 2027, m = 1, d = 1] = iso.split("-").map(Number);
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh - 6, mm, 0);
}
function money(n: number): string {
  return `৳${bn(Math.round(n).toLocaleString("en-IN"))}`;
}
const MONTHS_FULL_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
/** ISO timestamp -> "২৫ ফেব্রুয়ারি ২০২৬" */
function fmtISODateBn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${bn(d.getUTCDate())} ${MONTHS_FULL_BN[d.getUTCMonth()] ?? ""} ${bn(d.getUTCFullYear())}`;
}

/** Persists a query's latest successful response to the on-device cache. */
function usePersistCache(key: string | null, data: unknown) {
  useEffect(() => {
    if (key && data !== undefined) writeCache(key, data);
  }, [key, data]);
}

// ---------- Sehri alarm sound ----------

let sharedAudio: AudioContext | null = null;
function playAlarmSound() {
  try {
    sharedAudio ??= new AudioContext();
    const ctx = sharedAudio;
    void ctx.resume();
    const start = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i % 2 === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.5, start + i * 0.45 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.45 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.45);
      osc.stop(start + i * 0.45 + 0.42);
    }
    navigator.vibrate?.([300, 100, 300, 100, 300]);
  } catch {
    // sound is best-effort; the on-screen banner still shows
  }
}

// ---------- small UI pieces ----------

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(11,61,46,0.07)] ${className}`}>
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display-bn flex items-center gap-2 text-lg font-bold text-[var(--text)]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--gold)" aria-hidden="true" className="shrink-0">
        <path d="M20.6 14.2A8.8 8.8 0 0 1 9.8 3.4a.6.6 0 0 0-.8-.8 10.5 10.5 0 1 0 12.4 12.4.6.6 0 0 0-.8-.8Z" />
      </svg>
      <span>{children}</span>
    </h2>
  );
}

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--gold)]";
const primaryBtn =
  "w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)]";

/** Mirrors the server's canonicalPhone: ০১…, 01…, +8801…, spaces — সব একই নম্বর। */
const BN_DIGIT_CHARS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};
function normalizePhoneInput(raw: string): string {
  const latin = raw.replace(/[০-৯]/g, (ch) => BN_DIGIT_CHARS[ch] ?? ch);
  let digits = latin.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length >= 13) digits = `0${digits.slice(3)}`;
  else if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return digits;
}

// ---------- auth screen ----------

function AuthScreen({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [districtEn, setDistrictEn] = useState("Jamalpur");
  const [error, setError] = useState("");

  const register = useMutation({
    mutationFn: async (p: string) => await api.register({ name, phone: p, password, districtEn }),
    onSuccess: (d) => onAuthed(d.token),
    onError: (e) => setError(e instanceof Error ? e.message : "অ্যাকাউন্ট তৈরি হয়নি"),
  });
  const login = useMutation({
    mutationFn: async (p: string) => await api.login({ phone: p, password }),
    onSuccess: (d) => onAuthed(d.token),
    onError: (e) => setError(e instanceof Error ? e.message : "লগইন হয়নি"),
  });

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    const cleanPhone = normalizePhoneInput(phone);
    if (cleanPhone.length < 11) return setError("সঠিক মোবাইল নম্বর দিন (কমপক্ষে ১১ সংখ্যার)");
    if (mode === "register") {
      if (name.trim().length < 2) return setError("আপনার নাম লিখুন");
      if (password.length < 4) return setError("পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে");
      register.mutate(cleanPhone);
    } else {
      if (!password) return setError("পাসওয়ার্ড দিন");
      login.mutate(cleanPhone);
    }
  }

  const busy = register.isPending || login.isPending;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10">
      <img
        src={heroImg}
        alt="সবুজ আকাশে সোনালি অর্ধচন্দ্র, তারা আর মসজিদের ছায়া — রমজানের চিত্র"
        className="mt-4 h-44 w-full rounded-[var(--radius)] object-cover shadow-[0_4px_18px_rgba(11,61,46,0.25)] ring-1 ring-[var(--gold)]/40"
      />
      <h1 className="font-display-bn mt-4 text-center text-3xl font-bold text-[var(--text)]">রমজান অ্যাপ</h1>
      <div aria-hidden="true" className="mx-auto mt-2 flex items-center justify-center gap-1.5">
        <span className="h-px w-10 bg-[var(--gold)]" />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--gold)"><path d="M20.6 14.2A8.8 8.8 0 0 1 9.8 3.4a.6.6 0 0 0-.8-.8 10.5 10.5 0 1 0 12.4 12.4.6.6 0 0 0-.8-.8Z" /></svg>
        <span className="h-px w-10 bg-[var(--gold)]" />
      </div>
      <p className="mt-1 text-center text-[var(--dim)]">
        আপনার জেলার সেহরি-ইফতারের সময়, রোজা ট্র্যাকার, দোয়া ও হাদিস — সম্পূর্ণ বাংলায়, কোনো বিজ্ঞাপন ছাড়া।
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label="লগইন বা সাইন আপ">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => { setMode("login"); setError(""); }}
          className={mode === "login" ? primaryBtn : ghostBtn}
        >
          লগইন
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => { setMode("register"); setError(""); }}
          className={mode === "register" ? primaryBtn : ghostBtn}
        >
          সাইন আপ
        </button>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === "register" && (
          <div>
            <label htmlFor="auth-name" className="mb-1 block text-sm font-medium">আপনার নাম</label>
            <input id="auth-name" {...FIELDS.register.name} className={inputCls} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="যেমন: মোঃ তুহিন" autoComplete="name" />
          </div>
        )}
        <div>
          <label htmlFor="auth-phone" className="mb-1 block text-sm font-medium">মোবাইল নম্বর</label>
          <input id="auth-phone" {...FIELDS.register.phone} className={inputCls} value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" inputMode="tel" autoComplete="tel" />
          {mode === "login" && (
            <p className="mt-1 text-sm text-[var(--dim)]">
              আগে যে নম্বর দিয়ে অ্যাকাউন্ট খুলেছিলেন, সেই নম্বর ও পাসওয়ার্ড দিয়েই লগইন হবে — নম্বরটা 01…, +8801… বা বাংলা সংখ্যায় লিখলেও চলবে।
            </p>
          )}
        </div>
        <div>
          <label htmlFor="auth-pass" className="mb-1 block text-sm font-medium">পাসওয়ার্ড</label>
          <input id="auth-pass" {...FIELDS.register.password} type="password" className={inputCls} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="পাসওয়ার্ড লিখুন"
            autoComplete={mode === "register" ? "new-password" : "current-password"} />
        </div>
        {mode === "register" && (
          <div>
            <label htmlFor="auth-district" className="mb-1 block text-sm font-medium">আপনার জেলা</label>
            <select id="auth-district" className={inputCls} value={districtEn}
              onChange={(e) => setDistrictEn(e.target.value)} aria-label="আপনার জেলা">
              {DISTRICTS.map((d) => (
                <option key={d.en} value={d.en}>{d.bn}</option>
              ))}
            </select>
            <p className="mt-1 text-sm text-[var(--dim)]">জেলা অনুযায়ী সেহরি-ইফতারের সময় দেখানো হবে। পরে সেটিংস থেকে বদলাতে পারবেন।</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "অপেক্ষা করুন…" : mode === "register" ? "অ্যাকাউন্ট খুলুন" : "লগইন করুন"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--dim)]">
        অ্যাকাউন্টে আপনার জেলা, রোজা ট্র্যাকার আর সেটিংস সেভ থাকবে — যেকোনো ফোন থেকে লগইন করলেই পাবেন।
      </p>
    </div>
  );
}

// ---------- countdown ----------

function useNowTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Countdown({ today, tomorrow }: { today: DayInfo; tomorrow?: DayInfo }) {
  const now = useNowTick(1000);
  const event = useMemo(() => {
    const fajrT = timeToMs(today.dateISO, today.timings.fajr);
    const maghT = timeToMs(today.dateISO, today.timings.maghrib);
    if (now < fajrT) {
      return { label: today.isRamadan ? "সেহরি শেষ হতে বাকি" : "ফজরের ওয়াক্ত হতে বাকি", at: fajrT };
    }
    if (now < maghT) {
      return { label: today.isRamadan ? "ইফতার হতে বাকি" : "মাগরিবের ওয়াক্ত হতে বাকি", at: maghT };
    }
    if (tomorrow) {
      return {
        label: tomorrow.isRamadan ? "আগামীকালের সেহরি শেষ হতে বাকি" : "আগামীকালের ফজর হতে বাকি",
        at: timeToMs(tomorrow.dateISO, tomorrow.timings.fajr),
      };
    }
    return null;
  }, [now, today, tomorrow]);

  if (!event) return null;
  const remain = Math.max(0, Math.floor((event.at - now) / 1000));
  const hh = Math.floor(remain / 3600);
  const mm = Math.floor((remain % 3600) / 60);
  const ss = remain % 60;

  return (
    <div className="text-center">
      <p className="text-sm font-medium text-[var(--gold)]">{event.label}</p>
      <p className="mt-0.5 text-[2.6rem] font-bold leading-none tabular-nums text-white" aria-live="off">
        {bn(pad2(hh))}:{bn(pad2(mm))}:{bn(pad2(ss))}
      </p>
      <p className="mt-0.5 text-sm text-emerald-50/90">ঘণ্টা : মিনিট : সেকেন্ড</p>
    </div>
  );
}

// ---------- tabs ----------

type TabId = "home" | "calendar" | "amal" | "khatam" | "dua" | "hisab" | "settings";

const TABS: { id: TabId; label: string; path: string }[] = [
  { id: "home", label: "হোম", path: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1Z" },
  { id: "calendar", label: "ক্যালেন্ডার", path: "M7 2v3M17 2v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
  { id: "amal", label: "আমল", path: "M9 12.5 11 14.5 15.5 10M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" },
  { id: "khatam", label: "খতম", path: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" },
  { id: "dua", label: "দোয়া", path: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" },
  { id: "hisab", label: "হিসাব", path: "M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" },
  { id: "settings", label: "সেটিংস", path: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1 1.55.61.26 1.32.13 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01c.26.6.87 1 1.55 1H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1Z" },
];

function TabBar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <nav aria-label="প্রধান মেনু" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] pb-safe">
      <div className="mx-auto grid max-w-2xl grid-cols-7">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[0.8rem] font-semibold ${
              tab === t.id ? "text-[var(--accent)]" : "text-[var(--dim)]"
            }`}
          >
            {tab === t.id && (
              <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--gold)]" />
            )}
            <span className={`flex h-8 w-10 items-center justify-center rounded-full ${tab === t.id ? "bg-[var(--sage)]" : ""}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.path} />
              </svg>
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---------- home tab ----------

function HomeTab({
  user, today, tomorrow, calendar, hijriYear, goDua, onRefresh, refreshing,
}: {
  user: User;
  today?: DayInfo;
  tomorrow?: DayInfo;
  calendar?: DayInfo[];
  hijriYear: number;
  goDua: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const district = findDistrict(user.districtEn);
  if (!today) {
    return (
      <div className="space-y-4">
        <Card><p className="text-[var(--dim)]">আজকের সময় লোড হচ্ছে…</p></Card>
      </div>
    );
  }
  const t = today.timings;
  const firstDay = calendar?.[0];
  const daysUntil = firstDay && !today.isRamadan ? diffDaysISO(today.dateISO, firstDay.dateISO) : 0;
  const hadithIdx = today.isRamadan ? (today.hijriDay - 1) % 30 : (Math.floor(Date.parse(today.dateISO) / 86400000) % 30);
  const hadith = HADITHS[hadithIdx] ?? HADITHS[0]!;
  const inQadrNights = today.isRamadan && today.hijriDay >= 21;
  const tonightOdd = today.hijriDay % 2 === 1;
  const ashra = ashraOfDay(today.hijriDay);

  const prayers: { name: string; time: string; key: string }[] = [
    { name: "ফজর", time: t.fajr, key: "fajr" },
    { name: "সূর্যোদয়", time: t.sunrise, key: "sunrise" },
    { name: "যোহর", time: t.dhuhr, key: "dhuhr" },
    { name: "আসর (হানাফি)", time: t.asr, key: "asr" },
    { name: "মাগরিব", time: t.maghrib, key: "maghrib" },
    { name: "ইশা", time: t.isha, key: "isha" },
  ];
  const nowMs = Date.now();
  const nextKey = (() => {
    for (const p of prayers) {
      if (timeToMs(today.dateISO, p.time) > nowMs) return p.key;
    }
    return "fajr";
  })();

  return (
    <div className="space-y-4">
      <div
        className="poster-band overflow-hidden rounded-[var(--radius)] px-4 py-3 shadow-[0_4px_18px_rgba(11,61,46,0.25)] ring-1 ring-[var(--gold)]/40"
        style={{
          backgroundImage: `linear-gradient(165deg, rgba(5,32,23,0.90) 0%, rgba(5,32,23,0.74) 52%, rgba(3,20,14,0.88) 100%), url(${mosqueImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center 36%",
        }}
      >
        <p className="text-center text-sm text-emerald-50">
          {fmtDateBn(today)} • জেলা: {district.bn}
        </p>
        <p className="font-display-bn mt-0.5 text-center text-[1.2rem] font-semibold leading-relaxed text-white">
          {bn(today.hijriDay)} {HIJRI_MONTHS_BN[today.hijriMonth] ?? ""} {bn(today.hijriYear)} হিজরি
        </p>
        {today.isRamadan ? (
          <p className="mt-1 text-center text-xl font-bold text-[var(--gold)]">
            আজ {ordinalBn(today.hijriDay)} রোজা
            <span className="block text-base font-semibold text-white">আশরা: {ashra.name} (রোজা {bn(ashra.startDay)}–{bn(ashra.endDay)})</span>
          </p>
        ) : daysUntil > 0 && firstDay ? (
          <p className="mt-1 text-center text-lg font-semibold text-[var(--gold)]">
            রমজান শুরু হতে বাকি {bn(daysUntil)} দিন
            <span className="block text-sm font-normal text-emerald-50">সম্ভাব্য ১ম রোজা: {fmtDateBn(firstDay)} — চাঁদ দেখা সাপেক্ষে</span>
          </p>
        ) : null}
        <div className="mt-1">
          <Countdown today={today} tomorrow={tomorrow} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg border border-white/25 bg-black/40 px-2 py-1.5">
            <p className="text-sm text-emerald-50">{today.isRamadan ? "সেহরি শেষ" : "ফজর"}</p>
            <p className="text-xl font-bold text-white">{fmtTime(t.fajr)}</p>
          </div>
          <div className="rounded-lg border border-white/25 bg-black/40 px-2 py-1.5">
            <p className="text-sm text-emerald-50">{today.isRamadan ? "ইফতার" : "মাগরিব"}</p>
            <p className="text-xl font-bold text-white">{fmtTime(t.maghrib)}</p>
          </div>
        </div>
      </div>

      {today.isRamadan && (
        <Card>
          <SectionTitle>তিন আশরা — এখন {ashra.of} আশরা চলছে</SectionTitle>
          <ol className="mt-2 space-y-1.5">
            {ASHRAS.map((a) => (
              <li
                key={a.name}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                  a.name === ashra.name ? "bg-[var(--sage)] font-bold text-[var(--accent)]" : "text-[var(--dim)]"
                }`}
              >
                <span>{a.name} — রোজা {bn(a.startDay)}–{bn(a.endDay)}</span>
                {a.name === ashra.name && (
                  <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-xs font-bold text-[#231a00]">চলছে</span>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="font-semibold text-[var(--accent)]">{ashra.dua.title}</p>
            <p className="mt-2 text-center text-[1.3rem] leading-[2.1]" dir="rtl" lang="ar">{ashra.dua.arabic}</p>
            <p className="mt-1 leading-relaxed"><span className="font-medium text-[var(--dim)]">উচ্চারণ: </span>{ashra.dua.transliteration}</p>
            <p className="mt-1 leading-relaxed"><span className="font-medium text-[var(--dim)]">অর্থ: </span>{ashra.dua.bengali}</p>
            <p className="mt-1 text-sm text-[var(--dim)]">— {ashra.dua.source}</p>
          </div>
        </Card>
      )}

      {inQadrNights && (
        <section className="rounded-[var(--radius)] bg-[var(--night)] p-4 text-white shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--gold)]">শেষ দশক — লাইলাতুল কদর তালাশ করুন</h2>
          <p className="mt-1 text-sm text-slate-200">
            রমজানের শেষ দশক চলছে। {tonightOdd ? "আজকের রাতটি বেজোড় রাত — কদরের সম্ভাব্য রাত।" : "বেজোড় রাতগুলোতে (২১, ২৩, ২৫, ২৭, ২৯) কদর তালাশ করুন।"} বেশি বেশি ইবাদত ও দোয়া করুন।
          </p>
          <button type="button" onClick={goDua} className="mt-3 rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-semibold text-[#231a00]">
            কদরের দোয়া দেখুন
          </button>
        </section>
      )}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>আজকের নামাজের সময় — {district.bn}</SectionTitle>
          <button type="button" onClick={onRefresh} disabled={refreshing} className={ghostBtn} aria-label="সময় রিফ্রেশ করুন">
            {refreshing ? "হচ্ছে…" : "রিফ্রেশ"}
          </button>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {prayers.map((p) => (
            <li key={p.key} className={`flex items-center justify-between py-2.5 ${p.key === nextKey ? "font-bold text-[var(--accent)]" : ""}`}>
              <span>{p.name} {p.key === nextKey && <span className="ml-1 rounded bg-[var(--sage)] px-1.5 py-0.5 text-xs">এরপর</span>}</span>
              <span className="tabular-nums">{fmtTime(p.time)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-[var(--dim)]">
          সময় ইসলামিক ফাউন্ডেশনের পদ্ধতি (ফজর ১৮°) ও হানাফি আসর অনুযায়ী হিসাব করা। চাঁদ দেখার ভিত্তিতে ইসলামিক ফাউন্ডেশনের চূড়ান্ত ঘোষণাই প্রযোজ্য।
        </p>
      </Card>

      <Card className="border-l-4 border-l-[var(--gold)]">
        <SectionTitle>আজকের হাদিস — {hadithTopic(hadithIdx)}</SectionTitle>
        <p className="mt-2 leading-relaxed text-[var(--text)]">{hadith.text}</p>
        <p className="mt-2 text-sm text-[var(--dim)]">সূত্র: {hadith.source}</p>
        <button type="button" onClick={goDua} className="mt-2 text-sm font-medium text-[var(--accent)] underline">
          সব দোয়া ও ৩০ দিনের হাদিসের পূর্ণ বিবরণ দেখুন
        </button>
      </Card>

      <p className="pb-2 text-center text-sm text-[var(--dim)]">রমজান {bn(hijriYear)} হিজরি • কোনো বিজ্ঞাপন নেই</p>
    </div>
  );
}

// ---------- calendar tab ----------

function DayScheduleDetail({ day }: { day: DayInfo }) {
  const t = day.timings;
  const qadrNight = day.hijriDay >= 21 && day.hijriDay % 2 === 1;
  const ashra = ashraOfDay(day.hijriDay);
  const rows: { name: string; time: string; strong?: boolean }[] = [
    { name: "সেহরি শেষ", time: t.fajr, strong: true },
    { name: "ফজর", time: t.fajr, strong: true },
    { name: "সূর্যোদয়", time: t.sunrise },
    { name: "যোহর", time: t.dhuhr },
    { name: "আসর (হানাফি)", time: t.asr },
    { name: "ইফতার (মাগরিব)", time: t.maghrib, strong: true },
    { name: "ইশা", time: t.isha },
  ];
  return (
    <div className="rounded-lg bg-[var(--sage)] p-2.5">
      <p className="font-display-bn text-base font-bold leading-snug text-[var(--text)]">
        {ordinalBn(day.hijriDay)} রোজা — {fmtDateBn(day)}
      </p>
      <p className="mt-0.5 text-sm leading-snug text-[var(--dim)]">
        {bn(day.hijriDay)} রমজান {bn(day.hijriYear)} হিজরি • আশরা: {ashra.name} (রোজা {bn(ashra.startDay)}–{bn(ashra.endDay)})
        {qadrNight && <span className="ml-1 font-medium text-[var(--gold)]">• লাইলাতুল কদরের সম্ভাব্য রাত</span>}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className={`flex items-baseline justify-between gap-1 border-b border-[var(--border)]/60 py-1 text-sm leading-snug ${r.strong ? "font-bold text-[var(--accent)]" : ""}`}>
            <span className="whitespace-nowrap">{r.name}</span>
            <span className="whitespace-nowrap tabular-nums">{fmtTime(r.time)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarTab({ user, calendar, todayISO }: { user: User; calendar?: DayInfo[]; todayISO: string }) {
  const district = findDistrict(user.districtEn);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  // Viewport position of the tapped row — the day's detail floats right
  // there (just above the row, or just below when there is no room above),
  // so the user never has to scroll to see it.
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const closePopup = () => {
    setSelectedISO(null);
    setAnchor(null);
  };

  // The floating detail is anchored to the row's on-screen spot; if the
  // page scrolls or resizes, close it instead of leaving it floating loose.
  // (The popup itself never scrolls — the whole schedule fits on one screen.)
  useEffect(() => {
    if (!selectedISO) return;
    const onScroll = () => {
      closePopup();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedISO]);

  if (!calendar) return <Card><p className="text-[var(--dim)]">ক্যালেন্ডার লোড হচ্ছে…</p></Card>;
  const selected = calendar.find((d) => d.dateISO === selectedISO) ?? null;

  // Floating panel placement: above the tapped row when it fits, below
  // otherwise; clamped so it never runs off the screen edges.
  let popupStyle: CSSProperties | null = null;
  if (selected && anchor) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(280, Math.min(anchor.width, vw - 24));
    const left = Math.max(12, Math.min(anchor.left, vw - width - 12));
    // The detail is laid out compactly (two-column grid, tight rows) so the
    // whole schedule fits on one screen — the popup never scrolls inside.
    const estHeight = 250;
    if (anchor.top - 8 >= estHeight) {
      popupStyle = { left, width, bottom: vh - anchor.top + 8 };
    } else {
      popupStyle = { left, width, top: anchor.bottom + 8 };
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>রমজানের ক্যালেন্ডার — {district.bn}</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">
          মোট {bn(calendar.length)} দিনের হিসাবি ক্যালেন্ডার। {calendar.length === 29 ? "চাঁদ দেখা গেলে ৩০তম রোজা যোগ হবে। " : ""}চূড়ান্ত তারিখ চাঁদ দেখা ও ইসলামিক ফাউন্ডেশনের ঘোষণা সাপেক্ষে।
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--accent)]">
          যেকোনো দিনের সারিতে চাপ দিলে সেই দিনের পূর্ণ সময়সূচি (সেহরি, ফজর, সূর্যোদয়, যোহর, আসর, ইফতার, ইশা) ঠিক সেখানেই ভেসে উঠবে — স্ক্রল করা লাগবে না। বাইরে চাপ দিলে বা তীর চিহ্নে আবার চাপ দিলে বন্ধ হয়ে যাবে।
        </p>
      </Card>

      <Card>
        <SectionTitle>তিন আশরা — ক্রমানুসারে</SectionTitle>
        <ol className="mt-2 space-y-2">
          {ASHRAS.map((a, i) => (
            <li key={a.name} className="flex gap-3">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] font-bold text-[var(--accent)]">
                {bn(i + 1)}
              </span>
              <div>
                <p className="font-semibold">{a.of} আশরা — রোজা {bn(a.startDay)}–{bn(a.endDay)}</p>
                <p className="text-sm text-[var(--dim)]">{a.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_10px_rgba(11,61,46,0.07)]">
        <table className="w-full text-left text-sm sm:text-base">
          <thead>
            <tr className="bg-[var(--sage)] text-[var(--text)]">
              <th scope="col" className="px-3 py-2 font-semibold">রোজা</th>
              <th scope="col" className="px-3 py-2 font-semibold">তারিখ</th>
              <th scope="col" className="px-3 py-2 font-semibold">সেহরি শেষ</th>
              <th scope="col" className="px-3 py-2 font-semibold">ইফতার</th>
            </tr>
          </thead>
          <tbody>
            {calendar.map((d) => {
              const isToday = d.dateISO === todayISO;
              const isSelected = d.dateISO === selectedISO;
              const qadrNight = d.hijriDay >= 21 && d.hijriDay % 2 === 1;
              return (
                <tr
                  key={d.dateISO}
                  onClick={(e) => {
                    if (isSelected) {
                      closePopup();
                    } else {
                      const r = e.currentTarget.getBoundingClientRect();
                      setAnchor({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
                      setSelectedISO(d.dateISO);
                    }
                  }}
                  aria-selected={isSelected}
                  className={`cursor-pointer border-t border-[var(--border)] ${isToday ? "bg-[var(--sage)] font-bold" : ""} ${isSelected ? "bg-[var(--gold)]/15" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {bn(d.hijriDay)}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className={`text-[var(--dim)] transition-transform ${isSelected ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                    <span className="mt-0.5 block text-[0.8rem] text-[var(--dim)]">{ashraOfDay(d.hijriDay).name}</span>
                    {qadrNight && <span className="mt-0.5 block text-xs font-medium text-[var(--gold)]">কদরের সম্ভাব্য রাত</span>}
                    {isToday && <span className="mt-0.5 block text-xs">আজ</span>}
                  </td>
                  <td className="px-3 py-2">{fmtDateBn(d)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtTime(d.timings.fajr)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtTime(d.timings.maghrib)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-center text-sm text-[var(--dim)]">সারিতে চাপ দিলে ঠিক সেখানেই সেই দিনের সব ওয়াক্তের সময় ভেসে উঠবে।</p>

      {selected && popupStyle && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={closePopup}
            aria-hidden="true"
          />
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${ordinalBn(selected.hijriDay)} রোজার পূর্ণ সময়সূচি`}
            style={popupStyle}
            className="fixed z-50 rounded-[var(--radius)] border-2 border-[var(--gold)] bg-[var(--surface)] p-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.35)]"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="font-bold text-[var(--text)]">দিনের পূর্ণ সময়সূচি</p>
              <button type="button" onClick={closePopup} className={ghostBtn} aria-label="সময়সূচি বন্ধ করুন">
                ✕ বন্ধ করুন
              </button>
            </div>
            <DayScheduleDetail day={selected} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- amal tab (roza tracker + tasbih) ----------

function AmalTab({
  token, hijriYear, calendar, today,
}: {
  token: string;
  hijriYear: number;
  calendar?: DayInfo[];
  today?: DayInfo;
}) {
  const queryClient = useQueryClient();
  const stateQ = useQuery({
    queryKey: ["mystate", token, hijriYear],
    queryFn: () => api.getMyState({ token, hijriYear }),
    initialData: () =>
      readCache<ApiResponse<typeof api, "getMyState">>(`mystate|${token}|${hijriYear}`),
  });
  usePersistCache(`mystate|${token}|${hijriYear}`, stateQ.data);
  const totalDays = calendar?.length ?? 30;
  const rozaMap = useMemo(() => {
    const m = new Map<number, "kept" | "qaza">();
    for (const r of stateQ.data?.roza ?? []) m.set(r.day, r.status);
    return m;
  }, [stateQ.data]);
  const kept = [...rozaMap.values()].filter((s) => s === "kept").length;
  const qaza = [...rozaMap.values()].filter((s) => s === "qaza").length;

  const rozaMut = useMutation({
    mutationFn: async (v: { day: number; status: "kept" | "qaza" | "none" }) =>
      await api.setRozaMark({ token, hijriYear, day: v.day, status: v.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mystate", token, hijriYear] }),
  });

  function cycleRoza(day: number) {
    const cur = rozaMap.get(day);
    const next = cur === undefined ? "kept" : cur === "kept" ? "qaza" : "none";
    rozaMut.mutate({ day, status: next });
  }

  // Auto-mark: once a Ramadan day is over (its Iftar time has passed) and
  // the user has not marked it, the day ticks itself as "রেখেছি". Days the
  // user already marked (রেখেছি or কাজা) are never touched, so a qaza can
  // still be set by tapping the day afterwards.
  const autoMarkedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!stateQ.data || !calendar || !today) return;
    const now = Date.now();
    const finished = calendar.filter((d) => {
      if (rozaMap.has(d.hijriDay) || autoMarkedRef.current.has(d.hijriDay)) return false;
      if (today.isRamadan) {
        if (d.hijriDay < today.hijriDay) return true;
        if (d.hijriDay === today.hijriDay) return now > timeToMs(d.dateISO, d.timings.maghrib);
        return false;
      }
      return d.dateISO < today.dateISO;
    });
    for (const d of finished) {
      autoMarkedRef.current.add(d.hijriDay);
      rozaMut.mutate({ day: d.hijriDay, status: "kept" });
    }
    // rozaMut is stable enough for this one-shot pass; rozaMap comes from stateQ.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateQ.data, calendar, today]);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>রোজা ট্র্যাকার</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">
          প্রতিটি দিনের বোতাম চাপুন — ফাঁকা → <b>রেখেছি</b> → <b>কাজা</b> → ফাঁকা, এভাবে বদলাবে।
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--accent)]">
          দিন শেষ হলে — ইফতারের সময় পার হলেই — সেদিনের রোজা নিজে থেকেই "রেখেছি" চিহ্নিত হয়ে যায়। কোনো দিন কাজা থাকলে বোতাম চেপে "কাজা" করে নিন।
        </p>
        <p className="mt-2 font-medium">
          রেখেছি: {bn(kept)}টি • কাজা: {bn(qaza)}টি • বাকি: {bn(Math.max(0, totalDays - kept - qaza))}টি
        </p>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const st = rozaMap.get(day);
            const isToday = today?.isRamadan && today.hijriDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => cycleRoza(day)}
                aria-label={`${bn(day)} নম্বর রোজা — ${st === "kept" ? "রেখেছি" : st === "qaza" ? "কাজা" : "চিহ্ন নেই"}`}
                className={`rounded-lg border px-1 py-2 text-center ${
                  st === "kept"
                    ? "border-transparent bg-[var(--accent)] font-bold text-white"
                    : st === "qaza"
                      ? "border-transparent bg-amber-400 font-bold text-amber-950"
                      : "border-[var(--border)] bg-[var(--surface)]"
                } ${isToday ? "ring-2 ring-[var(--gold)]" : ""}`}
              >
                <span className="block text-base leading-tight">{bn(day)}</span>
                <span className="block text-[0.75rem] leading-tight">
                  {st === "kept" ? "রেখেছি" : st === "qaza" ? "কাজা" : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {stateQ.data ? (
        <TasbihCard token={token} saved={stateQ.data.tasbih} />
      ) : (
        <Card><p className="text-[var(--dim)]">তসবিহের হিসাব লোড হচ্ছে…</p></Card>
      )}
    </div>
  );
}

function TasbihCard({ token, saved }: { token: string; saved: { dhikr: string; count: number }[] }) {
  const queryClient = useQueryClient();
  const [dhikr, setDhikr] = useState(DHIKRS[0]!.bengali);
  const [target, setTarget] = useState(100);
  const [session, setSession] = useState(0);
  // প্রতিটি জিকিরের নিজস্ব মোট — অ্যাকাউন্টে আলাদা আলাদা সেভ থাকে
  // (tasbih_counts: এক ব্যবহারকারী + এক জিকির = এক সারি)। এই ম্যাপটাই
  // কাউন্টার আর নিচের তালিকা দুটোরই উৎস; প্রতিটি চাপ সঙ্গে সঙ্গে সেই
  // জিকিরের মোটে যোগ হয়, তাই অর্ধেক রাউন্ডও (যেমন ৩৪ বার) হারায় না।
  const [totals, setTotals] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const s of saved) m[s.dhikr] = s.count;
    return m;
  });
  const editedRef = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ dhikr: string; count: number } | null>(null);
  const saveMut = useMutation({
    mutationFn: async (v: { dhikr: string; count: number }) => await api.setTasbih({ token, dhikr: v.dhikr, count: v.count }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mystate", token] }),
  });

  // সার্ভার থেকে নতুন হিসাব এলে (যেমন অন্য ডিভাইসে গোনা) যেসব জিকির এই
  // সেশনে ছোঁয়া হয়নি সেগুলো হালনাগাদ হয়; চলতি গোনা কখনো মুছে যায় না
  useEffect(() => {
    setTotals((prev) => {
      const next = { ...prev };
      for (const s of saved) {
        if (!editedRef.current.has(s.dhikr)) next[s.dhikr] = s.count;
      }
      return next;
    });
  }, [saved]);

  const count = totals[dhikr] ?? 0;

  function scheduleSave(d: string, nextTotal: number) {
    pendingRef.current = { dhikr: d, count: nextTotal };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingRef.current) saveMut.mutate(pendingRef.current);
      pendingRef.current = null;
    }, 500);
  }
  function flushSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingRef.current) {
      saveMut.mutate(pendingRef.current);
      pendingRef.current = null;
    }
  }
  function tap() {
    const nextTotal = count + 1;
    editedRef.current.add(dhikr);
    setTotals((prev) => ({ ...prev, [dhikr]: nextTotal }));
    const nextSession = session + 1;
    if (nextSession >= target) {
      setSession(0);
      navigator.vibrate?.(80);
    } else {
      setSession(nextSession);
    }
    scheduleSave(dhikr, nextTotal);
  }
  function switchDhikr(d: string) {
    flushSave();
    setDhikr(d);
    setSession(0);
  }
  function resetCurrent() {
    editedRef.current.add(dhikr);
    setTotals((prev) => ({ ...prev, [dhikr]: 0 }));
    setSession(0);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingRef.current = null;
    saveMut.mutate({ dhikr, count: 0 });
  }

  const current = DHIKRS.find((d) => d.bengali === dhikr) ?? DHIKRS[0]!;

  return (
    <Card>
      <SectionTitle>তসবিহ কাউন্টার</SectionTitle>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="জিকির বাছাই">
        {DHIKRS.map((d) => (
          <button
            key={d.bengali}
            type="button"
            onClick={() => switchDhikr(d.bengali)}
            aria-pressed={dhikr === d.bengali}
            className={`rounded-full px-3 py-1.5 text-sm ${dhikr === d.bengali ? "bg-[var(--accent)] font-semibold text-white" : "border border-[var(--border)]"}`}
          >
            {d.bengali}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-2xl leading-relaxed" dir="rtl" lang="ar">{current.arabic}</p>
      <p className="text-center text-[var(--dim)]">{current.bengali}</p>

      <div className="mt-3 flex items-center justify-center gap-2" role="group" aria-label="লক্ষ্য বাছাই">
        {[33, 100, 500, 1000].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTarget(t); setSession(0); }}
            aria-pressed={target === t}
            className={`rounded-lg px-3 py-1.5 text-sm ${target === t ? "bg-[var(--gold)] font-semibold text-[#231a00]" : "border border-[var(--border)]"}`}
          >
            লক্ষ্য {bn(t)}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={tap}
        aria-label={`তসবিহ গুনুন — এখন ${bn(session)} বার হয়েছে, লক্ষ্য ${bn(target)}`}
        className="mx-auto mt-4 flex h-44 w-44 flex-col items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg active:scale-95"
      >
        <span className="text-5xl font-bold tabular-nums">{bn(session)}</span>
        <span className="mt-1 text-sm">/ {bn(target)} — চাপ দিন</span>
      </button>
      <div className="mx-auto mt-3 h-2.5 w-44 overflow-hidden rounded-full bg-[var(--sage)]">
        <div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${(session / target) * 100}%` }} />
      </div>
      <p className="mt-3 text-center font-medium">এই জিকিরে সর্বমোট: {bn(count)} বার • এই রাউন্ডে {bn(session)}/{bn(target)}</p>
      <div className="mt-2 text-center">
        <button type="button" onClick={resetCurrent} className={ghostBtn} aria-label="এই জিকিরের হিসাব শূন্য করুন">এই জিকিরের হিসাব রিসেট করুন</button>
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="font-semibold">প্রতিটি জিকিরের মোট হিসাব</p>
        <ul className="mt-1 divide-y divide-[var(--border)]">
          {DHIKRS.map((d) => (
            <li key={d.bengali} className="flex items-center justify-between gap-2 py-2">
              <span className={d.bengali === dhikr ? "font-bold text-[var(--accent)]" : ""}>
                {d.bengali}
                {d.bengali === dhikr && <span className="ml-1 text-sm font-medium text-[var(--dim)]">(এখন পড়ছেন)</span>}
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums">{bn(totals[d.bengali] ?? 0)} বার</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
          প্রতিটি জিকিরের হিসাব আলাদাভাবে আপনার অ্যাকাউন্টে সেভ থাকে — অ্যাপ বন্ধ করে পরে খুললেও প্রতিটির মোট এখানেই দেখা যাবে।
        </p>
      </div>
    </Card>
  );
}

// ---------- khatam tab (its own section: ৩০ দিনে ১ খতম) ----------

function KhatamTab({
  token, hijriYear, today,
}: {
  token: string;
  hijriYear: number;
  today?: DayInfo;
}) {
  const queryClient = useQueryClient();
  const stateQ = useQuery({
    queryKey: ["mystate", token, hijriYear],
    queryFn: () => api.getMyState({ token, hijriYear }),
    initialData: () =>
      readCache<ApiResponse<typeof api, "getMyState">>(`mystate|${token}|${hijriYear}`),
  });
  usePersistCache(`mystate|${token}|${hijriYear}`, stateQ.data);
  const khatamSet = useMemo(() => new Set(stateQ.data?.khatamDays ?? []), [stateQ.data]);
  const khatamMut = useMutation({
    mutationFn: async (v: { day: number; done: boolean }) =>
      await api.setKhatamDay({ token, hijriYear, day: v.day, done: v.done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mystate", token, hijriYear] }),
  });

  const todayPara = today?.isRamadan ? today.hijriDay : null;
  const todayJuz = todayPara ? KHATAM_PLAN[todayPara - 1] : undefined;
  const donePages = [...khatamSet].reduce((sum, d) => {
    const j = KHATAM_PLAN[d - 1];
    return sum + (j ? j.endPage - j.startPage + 1 : 0);
  }, 0);
  const todayDone = todayPara ? khatamSet.has(todayPara) : false;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>কোরআন খতম প্ল্যান — ৩০ দিনে ১ খতম</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          প্রতিদিন ১ পারা (প্রায় ২০ পৃষ্ঠা) পড়লেই পুরো রমজানে একবার কোরআন খতম হবে। প্রতিদিনের অংশে পারার নামের পাশাপাশি সূরা ও আয়াতের ভাগও দেওয়া আছে — পড়া শেষ হলে টিক দিন, অগ্রগতি আপনার অ্যাকাউন্টে সেভ থাকবে।
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--sage)]" role="progressbar" aria-valuenow={khatamSet.size} aria-valuemin={0} aria-valuemax={30} aria-label="খতম অগ্রগতি">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${(khatamSet.size / 30) * 100}%` }} />
        </div>
        <p className="mt-1.5 font-medium">
          {bn(khatamSet.size)} / ৩০ দিন সম্পন্ন • {bn(donePages)} / ৬০৪ পৃষ্ঠা পড়া হয়েছে
        </p>
        {khatamSet.size === 30 && (
          <p className="mt-1 font-semibold text-[var(--accent)]">আলহামদুলিল্লাহ! এবারের খতম সম্পন্ন হয়েছে।</p>
        )}
      </Card>

      {todayJuz && todayPara && (
        <Card className="border-[var(--gold)]">
          <SectionTitle>আজকের পড়া — {ordinalBn(todayPara)} রোজা</SectionTitle>
          <div className="mt-2 flex items-start gap-3">
            <input
              type="checkbox"
              id="khatam-today"
              checked={todayDone}
              onChange={(e) => khatamMut.mutate({ day: todayPara, done: e.target.checked })}
              className="mt-1 h-6 w-6 shrink-0 accent-[#0b3d2e]"
            />
            <label htmlFor="khatam-today" className="flex-1">
              <span className="text-lg font-bold">পারা {bn(todayJuz.para)}: {todayJuz.name}</span>
              <span className="block text-[var(--dim)]">{todayJuz.range}</span>
              <span className="block text-sm text-[var(--dim)]">পৃষ্ঠা {bn(todayJuz.startPage)}–{bn(todayJuz.endPage)} (মোট {bn(todayJuz.endPage - todayJuz.startPage + 1)} পৃষ্ঠা)</span>
              <span className="mt-0.5 block text-sm font-medium text-[var(--accent)]">
                {todayDone ? "আজকের পড়া শেষ হয়েছে ✓" : "পড়া শেষ হলে বামে টিক দিন"}
              </span>
            </label>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>৩০ দিনের পূর্ণ ভাগ</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">
          বাক্সগুলো আমল ট্যাবের মতো ডান থেকে বামে সাজানো — ১ম দিন সবার ডানে, তারপর বামের দিকে এগিয়ে গেছে। পড়া শেষ হলে সেই দিনের বাক্সে চাপ দিলেই টিক পড়বে; আবার চাপ দিলে টিক উঠে যাবে।
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" dir="rtl">
          {KHATAM_PLAN.map((j) => {
            const done = khatamSet.has(j.para);
            const isToday = todayPara === j.para;
            return (
              <button
                key={j.para}
                type="button"
                onClick={() => khatamMut.mutate({ day: j.para, done: !done })}
                aria-pressed={done}
                aria-label={`দিন ${bn(j.para)} — পারা ${bn(j.para)}: ${j.name}, ${j.range}, পৃষ্ঠা ${bn(j.startPage)} থেকে ${bn(j.endPage)} — ${done ? "পড়া হয়েছে" : "পড়া হয়নি"}`}
                className={`rounded-lg border px-1.5 py-2 text-center ${
                  done
                    ? "border-transparent bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-[var(--surface)]"
                } ${isToday ? "ring-2 ring-[var(--gold)]" : ""}`}
              >
                <span className="block text-base font-bold leading-tight">দিন {bn(j.para)}</span>
                <span className="block text-[0.8rem] font-semibold leading-tight">পারা {bn(j.para)}: {j.name}</span>
                <span className={`mt-0.5 block text-[0.75rem] leading-snug ${done ? "text-white/85" : "text-[var(--dim)]"}`}>{j.range}</span>
                <span className={`block text-[0.75rem] leading-tight ${done ? "text-white/85" : "text-[var(--dim)]"}`}>পৃষ্ঠা {bn(j.startPage)}–{bn(j.endPage)}</span>
                <span className="mt-0.5 block text-[0.75rem] font-bold leading-tight">
                  {done ? "✓ পড়া হয়েছে" : isToday ? "আজকের পড়া" : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---------- dua tab ----------

function DuaTab({ today }: { today?: DayInfo }) {
  const hadithIdx = today?.isRamadan ? (today.hijriDay - 1) % 30 : 0;
  const qadrDua = DUAS.find((d) => d.title.includes("লাইলাতুল কদর")) ?? DUAS[3]!;
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] bg-[var(--night)] p-4 text-white shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--gold)]">লাইলাতুল কদর</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">
          লাইলাতুল কদর হাজার মাসের চেয়েও উত্তম (সূরা আল-কদর: ৩)। রমজানের শেষ দশকের বেজোড় রাতগুলোতে (২১, ২৩, ২৫, ২৭, ২৯) এই রাত তালাশ করুন। আয়েশা (রা.)-কে নবীজি (সা.) এই দোয়াটি শিখিয়েছিলেন:
        </p>
        <p className="mt-3 text-center text-2xl leading-relaxed" dir="rtl" lang="ar">{qadrDua.arabic}</p>
        <p className="mt-2 leading-relaxed"><span className="text-slate-300">উচ্চারণ: </span>{qadrDua.transliteration}</p>
        <p className="mt-1 leading-relaxed"><span className="text-slate-300">অর্থ: </span>{qadrDua.bengali}</p>
        <p className="mt-1 text-sm text-slate-300">— {qadrDua.source}</p>
      </section>

      <Card className="border-l-4 border-l-[var(--gold)]">
        <SectionTitle>{today?.isRamadan ? `${ordinalBn(today.hijriDay)} রোজার হাদিস` : "আজকের হাদিস"} — {hadithTopic(hadithIdx)}</SectionTitle>
        <p className="mt-2 leading-relaxed">{(HADITHS[hadithIdx] ?? HADITHS[0]!).text}</p>
        <p className="mt-2 text-sm text-[var(--dim)]">সূত্র: {(HADITHS[hadithIdx] ?? HADITHS[0]!).source}</p>
      </Card>

      <Card>
        <SectionTitle>তিন আশরার দোয়া</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">
          রমজানের তিন আশরা ক্রমানুসারে — প্রথম ১০ দিন রহমত, মাঝের ১০ দিন মাগফিরাত, শেষ ১০ দিন নাজাত। প্রতিটি আশরার জন্য একটি দোয়া আরবি, বাংলা উচ্চারণ ও অর্থসহ:
        </p>
        <div className="mt-2 space-y-5">
          {ASHRAS.map((a) => (
            <article key={a.name} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
              <h3 className="font-semibold text-[var(--accent)]">
                {a.of} আশরা (রোজা {bn(a.startDay)}–{bn(a.endDay)}) — {a.dua.title}
                {today?.isRamadan && today.hijriDay >= a.startDay && today.hijriDay <= a.endDay && (
                  <span className="ml-2 rounded bg-[var(--sage)] px-1.5 py-0.5 text-xs font-medium text-[var(--text)]">চলছে</span>
                )}
              </h3>
              <p className="mt-1 text-sm text-[var(--dim)]">{a.note}</p>
              <p className="mt-2 text-center text-[1.35rem] leading-[2.2]" dir="rtl" lang="ar">{a.dua.arabic}</p>
              <p className="mt-2 leading-relaxed"><span className="font-medium text-[var(--dim)]">উচ্চারণ: </span>{a.dua.transliteration}</p>
              <p className="mt-1 leading-relaxed"><span className="font-medium text-[var(--dim)]">অর্থ: </span>{a.dua.bengali}</p>
              <p className="mt-1 text-sm text-[var(--dim)]">— {a.dua.source}</p>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>প্রয়োজনীয় দোয়াসমূহ</SectionTitle>
        <div className="mt-2 space-y-5">
          {DUAS.map((d) => (
            <article key={d.title} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
              <h3 className="font-semibold text-[var(--accent)]">{d.title}</h3>
              <p className="mt-2 text-center text-[1.35rem] leading-[2.2]" dir="rtl" lang="ar">{d.arabic}</p>
              <p className="mt-2 leading-relaxed"><span className="font-medium text-[var(--dim)]">উচ্চারণ: </span>{d.transliteration}</p>
              <p className="mt-1 leading-relaxed"><span className="font-medium text-[var(--dim)]">অর্থ: </span>{d.bengali}</p>
              <p className="mt-1 text-sm text-[var(--dim)]">— {d.source}</p>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>৩০ দিনের হাদিস — পূর্ণ বিবরণ</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">
          প্রতিদিনের হাদিসের সম্পূর্ণ বাংলা অর্থ ও সূত্র।
        </p>
        <ol className="mt-3 space-y-4">
          {HADITHS.map((h, i) => (
            <li key={i} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
              <p className="font-semibold text-[var(--accent)]">
                {ordinalBn(i + 1)} রোজা — {hadithTopic(i)}
                {today?.isRamadan && today.hijriDay === i + 1 && (
                  <span className="ml-2 rounded bg-[var(--sage)] px-1.5 py-0.5 text-xs font-medium text-[var(--text)]">আজকের</span>
                )}
              </p>
              <p className="mt-1 leading-relaxed">{h.text}</p>
              <p className="mt-1 text-sm text-[var(--dim)]">সূত্র: {h.source}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

// ---------- hisab tab (zakat + fitra) ----------

function HisabTab() {
  // Zakat state (all in taka except vori amounts)
  const [cash, setCash] = useState("");
  const [goldVori, setGoldVori] = useState("");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverVori, setSilverVori] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [business, setBusiness] = useState("");
  const [debt, setDebt] = useState("");
  const num = (s: string) => {
    const v = Number(s.replace(/[^0-9.]/g, ""));
    return Number.isFinite(v) ? v : 0;
  };
  const goldValue = num(goldVori) * num(goldPrice);
  const silverValue = num(silverVori) * num(silverPrice);
  const totalAssets = num(cash) + goldValue + silverValue + num(business);
  const net = totalAssets - num(debt);
  const nisabGold = num(goldPrice) > 0 ? 7.5 * num(goldPrice) : null;
  const nisabSilver = num(silverPrice) > 0 ? 52.5 * num(silverPrice) : null;
  const nisab = nisabSilver ?? nisabGold;
  const zakatDue = nisab !== null && net >= nisab ? net * 0.025 : 0;

  // Fitra state — the rates come from the server, which stores the Islamic
  // Foundation's latest announced rate and updates itself when a new rate is
  // announced. The last fetched rates are cached on the phone, so offline
  // the calculator still shows (and uses) the newest rate it ever received.
  const fitraQ = useQuery({
    queryKey: ["fitra"],
    queryFn: () => api.getFitraRates({}),
    initialData: () => readCache<ApiResponse<typeof api, "getFitraRates">>("fitra"),
  });
  usePersistCache("fitra", fitraQ.data);
  const fitra = fitraQ.data?.fitra;
  const fitraRates = fitra?.rates ?? FITRA_RATES;
  const fitraYear = fitra?.hijriYear ?? 1447;
  const [fitraItem, setFitraItem] = useState<string | null>(null);
  const [fitraPersons, setFitraPersons] = useState("1");
  const selectedRate = fitraRates.find((r) => r.item === fitraItem) ?? fitraRates[0];
  const effectiveRate = selectedRate?.rate ?? 0;
  const fitraTotal = effectiveRate * Math.max(0, Math.floor(num(fitraPersons)));

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>যাকাত ক্যালকুলেটর (টাকায়)</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          নিসাব: স্বর্ণ ৭.৫ ভরি (৮৭.৪৮ গ্রাম) অথবা রৌপ্য ৫২.৫ ভরি (৬১২.৩৬ গ্রাম) সমমূল্যের সম্পদ এক বছর থাকলে যাকাত ফরজ হয়। যাকাতের হার মোট সম্পদের ২.৫%। স্বর্ণ-রৌপ্যের আজকের বাজারদর নিজে বসান — দর বসালেই নিসাব হিসাব হবে।
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="zk-cash" className="mb-1 block text-sm font-medium">নগদ টাকা ও ব্যাংক জমা (৳)</label>
            <input id="zk-cash" className={inputCls} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="০" />
          </div>
          <div>
            <label htmlFor="zk-biz" className="mb-1 block text-sm font-medium">ব্যবসার মাল ও অন্যান্য সম্পদ (৳)</label>
            <input id="zk-biz" className={inputCls} inputMode="decimal" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="০" />
          </div>
          <div>
            <label htmlFor="zk-gold" className="mb-1 block text-sm font-medium">স্বর্ণ (ভরি)</label>
            <input id="zk-gold" className={inputCls} inputMode="decimal" value={goldVori} onChange={(e) => setGoldVori(e.target.value)} placeholder="০" />
          </div>
          <div>
            <label htmlFor="zk-goldprice" className="mb-1 block text-sm font-medium">প্রতি ভরি স্বর্ণের দাম (৳)</label>
            <input id="zk-goldprice" className={inputCls} inputMode="decimal" value={goldPrice} onChange={(e) => setGoldPrice(e.target.value)} placeholder="আজকের বাজারদর" />
          </div>
          <div>
            <label htmlFor="zk-silver" className="mb-1 block text-sm font-medium">রৌপ্য (ভরি)</label>
            <input id="zk-silver" className={inputCls} inputMode="decimal" value={silverVori} onChange={(e) => setSilverVori(e.target.value)} placeholder="০" />
          </div>
          <div>
            <label htmlFor="zk-silverprice" className="mb-1 block text-sm font-medium">প্রতি ভরি রৌপ্যের দাম (৳)</label>
            <input id="zk-silverprice" className={inputCls} inputMode="decimal" value={silverPrice} onChange={(e) => setSilverPrice(e.target.value)} placeholder="আজকের বাজারদর" />
          </div>
          <div>
            <label htmlFor="zk-debt" className="mb-1 block text-sm font-medium">ঋণ / দেনা (৳) — বাদ যাবে</label>
            <input id="zk-debt" className={inputCls} inputMode="decimal" value={debt} onChange={(e) => setDebt(e.target.value)} placeholder="০" />
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-[var(--sage)] p-3 leading-relaxed">
          <p>মোট সম্পদ: <b>{money(totalAssets)}</b> • ঋণ বাদে: <b>{money(Math.max(0, net))}</b></p>
          {nisabGold !== null && <p>স্বর্ণের নিসাব: {money(nisabGold)}</p>}
          {nisabSilver !== null && <p>রৌপ্যের নিসাব: {money(nisabSilver)}</p>}
          {nisab === null ? (
            <p className="mt-1 font-medium">নিসাব যাচাইয়ের জন্য স্বর্ণ বা রৌপ্যের বর্তমান বাজারদর বসান।</p>
          ) : net >= nisab ? (
            <p className="mt-1 text-lg font-bold text-[var(--accent)]">আপনার যাকাত এসেছে: {money(zakatDue)}</p>
          ) : (
            <p className="mt-1 font-medium">আপনার সম্পদ নিসাবের নিচে — এই হিসাব অনুযায়ী যাকাত ফরজ হয়নি।</p>
          )}
          <p className="mt-1 text-sm text-[var(--dim)]">সাধারণ হিসাবের জন্য এই ক্যালকুলেটর; জটিল ক্ষেত্রে নির্ভরযোগ্য আলেমের পরামর্শ নিন।</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>ফিতরার হিসাব</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          নিচের হার ইসলামিক ফাউন্ডেশনের সর্বশেষ ঘোষিত ({bn(fitraYear)} হিজরি) হার। নতুন হার ঘোষণা হলেই তা নিজে থেকে এখানে এসে যাবে — আপনাকে কিছুই করতে হবে না। ইন্টারনেট না থাকলেও সর্বশেষ পাওয়া হারটাই এখানে দেখাবে ও হিসাব হবে।
        </p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="ফিতরার ধরন">
          {fitraRates.map((r) => (
            <label key={r.item} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
              <input
                type="radio"
                name="fitra-rate"
                checked={selectedRate?.item === r.item}
                onChange={() => setFitraItem(r.item)}
                className="h-5 w-5 accent-[#0b3d2e]"
              />
              <span className="flex-1">{r.item}</span>
              <b>{money(r.rate)}</b>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <label htmlFor="ft-persons" className="mb-1 block text-sm font-medium">পরিবারের সদস্য সংখ্যা</label>
          <input id="ft-persons" className={inputCls} inputMode="numeric" value={fitraPersons} onChange={(e) => setFitraPersons(e.target.value)} placeholder="১" />
        </div>
        <p className="mt-3 rounded-lg bg-[var(--sage)] p-3 text-lg font-bold text-[var(--accent)]">
          মোট ফিতরা: {money(fitraTotal)} <span className="text-sm font-normal text-[var(--dim)]">({bn(Math.max(0, Math.floor(num(fitraPersons))))} জন × {money(effectiveRate)})</span>
        </p>
        <p className="mt-1 text-sm text-[var(--dim)]">ফিতরা ঈদের নামাজের আগেই গরিব-মিসকিনের কাছে পৌঁছে দেওয়া উত্তম।</p>
        {fitra && (
          <p className="mt-1 text-sm text-[var(--dim)]">
            সূত্র: {fitra.sourceName}
            {fitra.announcedOn ? ` • ঘোষণা: ${fmtISODateBn(fitra.announcedOn)}` : ""}
            {fitra.sourceUrl && (
              <>
                {" • "}
                <a href={fitra.sourceUrl} target="_blank" rel="noreferrer" className="underline">ঘোষণার খবরটি দেখুন</a>
              </>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------- notifications card (permission + hadith schedule) ----------

function NotificationCard({
  hadithNotif, onToggleHadithNotif,
}: {
  hadithNotif: boolean;
  onToggleHadithNotif: (on: boolean) => void;
}) {
  const native = isNativeShell();
  const [perm, setPerm] = useState(() => notificationPermission());
  const [nativePerm, setNativePerm] = useState<NativePermState>("unsupported");
  const [exactState, setExactState] = useState<"granted" | "denied" | "unsupported">("unsupported");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (!native) return;
    void nativeCheckPermission().then(setNativePerm);
    void nativeExactAlarmState().then(setExactState);
  }, [native]);

  async function enable() {
    const p = await requestNotificationPermission();
    setPerm(p);
  }
  async function enableNative() {
    const p = await nativeRequestPermission();
    setNativePerm(p);
    void nativeExactAlarmState().then(setExactState);
  }
  async function test() {
    setTestMsg("");
    const ok = await showNotification(
      "আজকের হাদিস — সেহরির বরকত",
      "তোমরা সেহরি খাও; কেননা সেহরিতে বরকত রয়েছে।\n— সহিহ বুখারি: ১৯২৩",
      "hadith-test",
    );
    setTestMsg(ok ? "পরীক্ষামূলক নোটিফিকেশন পাঠানো হয়েছে — ফোনের নোটিফিকেশন প্যানেলে দেখুন।" : "নোটিফিকেশন পাঠানো যায়নি — অনুমতি দেওয়া আছে কিনা দেখুন।");
  }
  async function testNative() {
    setTestMsg("");
    const ok = await nativeShowNow(
      "আজকের হাদিস — সেহরির বরকত",
      "তোমরা সেহরি খাও; কেননা সেহরিতে বরকত রয়েছে।\n— সহিহ বুখারি: ১৯২৩",
    );
    setTestMsg(ok ? "পরীক্ষামূলক নোটিফিকেশন পাঠানো হয়েছে — ফোনের নোটিফিকেশন প্যানেলে দেখুন।" : "নোটিফিকেশন পাঠানো যায়নি — অনুমতি দেওয়া আছে কিনা দেখুন।");
  }

  if (native) {
    return (
      <Card>
        <SectionTitle>নোটিফিকেশন</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          এই Android অ্যাপে হাদিসের নোটিফিকেশন ও সেহরির অ্যালার্ম ফোনের নিজের সিস্টেমে সময়মতো সেট হয়ে থাকে — অ্যাপ পুরোপুরি বন্ধ থাকলেও, এমনকি ফোন রিস্টার্ট হলেও ঠিক সময়ে আসবে।
        </p>

        {nativePerm !== "granted" && (
          <button type="button" onClick={enableNative} className={`${primaryBtn} mt-3`} aria-label="নোটিফিকেশনের অনুমতি দিন">
            নোটিফিকেশন চালু করুন
          </button>
        )}
        {nativePerm === "denied" && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            নোটিফিকেশনের অনুমতি বন্ধ করা আছে। চালু করতে ফোনের Settings → Apps → রমজান অ্যাপ → Notifications থেকে Allow করুন।
          </p>
        )}
        {nativePerm === "granted" && (
          <>
            <p className="mt-3 text-sm font-medium text-[var(--accent)]">নোটিফিকেশন চালু আছে ✓</p>
            <button type="button" onClick={testNative} className={`${ghostBtn} mt-2`} aria-label="পরীক্ষামূলক নোটিফিকেশন পাঠান">
              পরীক্ষামূলক নোটিফিকেশন পাঠান
            </button>
            {testMsg && <p role="status" className="mt-2 text-sm text-[var(--dim)]">{testMsg}</p>}
          </>
        )}

        {nativePerm === "granted" && exactState === "denied" && (
          <div className="mt-3 rounded-lg bg-[var(--sage)] px-3 py-2">
            <p className="text-sm leading-relaxed">
              ঠিক মিনিটে বাজতে অ্যালার্মের আলাদা অনুমতি লাগে (Android-এর নিয়ম)। অনুমতি না দিলে নোটিফিকেশন কয়েক মিনিট দেরিতে আসতে পারে।
            </p>
            <button
              type="button"
              onClick={() => void nativeOpenExactAlarmSettings()}
              className={`${ghostBtn} mt-2`}
              aria-label="সঠিক সময়ের অ্যালার্মের অনুমতি দিন"
            >
              সঠিক সময়ের অ্যালার্মের অনুমতি দিন
            </button>
          </div>
        )}
        {nativePerm === "granted" && exactState === "granted" && (
          <p className="mt-2 text-sm text-[var(--dim)]">সঠিক সময়ের অ্যালার্মের অনুমতিও দেওয়া আছে ✓</p>
        )}

        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={hadithNotif}
            onChange={(e) => onToggleHadithNotif(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[#0b3d2e]"
            aria-label="প্রতিদিন দুইবার হাদিসের নোটিফিকেশন"
          />
          <span className="font-medium">প্রতিদিন দুইবার হাদিসের নোটিফিকেশন</span>
        </label>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>নোটিফিকেশন</SectionTitle>
      <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
        নোটিফিকেশন চালু থাকলে সেহরির অ্যালার্ম ও প্রতিদিনের হাদিস ফোনের নোটিফিকেশন প্যানেলে আসবে — অ্যাপ সামনে খোলা না থাকলেও, যতক্ষণ অ্যাপটি ব্যাকগ্রাউন্ডে আছে।
      </p>

      {perm === "unsupported" && (
        <p className="mt-3 rounded-lg bg-[var(--sage)] px-3 py-2 text-sm">
          এই ব্রাউজারে নোটিফিকেশনের সুবিধা নেই — অ্যালার্ম ও হাদিস অ্যাপের ভেতরেই দেখতে পাবেন।
        </p>
      )}
      {perm === "default" && (
        <button type="button" onClick={enable} className={`${primaryBtn} mt-3`} aria-label="নোটিফিকেশনের অনুমতি দিন">
          নোটিফিকেশন চালু করুন
        </button>
      )}
      {perm === "denied" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          নোটিফিকেশনের অনুমতি বন্ধ করা আছে। চালু করতে ব্রাউজারের সাইট সেটিংস থেকে এই অ্যাপের নোটিফিকেশন Allow করুন।
        </p>
      )}
      {perm === "granted" && (
        <>
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">নোটিফিকেশন চালু আছে ✓</p>
          <button type="button" onClick={test} className={`${ghostBtn} mt-2`} aria-label="পরীক্ষামূলক নোটিফিকেশন পাঠান">
            পরীক্ষামূলক নোটিফিকেশন পাঠান
          </button>
          {testMsg && <p role="status" className="mt-2 text-sm text-[var(--dim)]">{testMsg}</p>}
        </>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={hadithNotif}
          onChange={(e) => onToggleHadithNotif(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-[#0b3d2e]"
          aria-label="প্রতিদিন দুইবার হাদিসের নোটিফিকেশন"
        />
        <span className="font-medium">প্রতিদিন দুইবার হাদিসের নোটিফিকেশন</span>
      </label>
    </Card>
  );
}

// ---------- settings + admin tab ----------

function SettingsTab({
  user, token, onLogout, hadithNotif, onToggleHadithNotif,
}: {
  user: User;
  token: string;
  onLogout: () => void;
  hadithNotif: boolean;
  onToggleHadithNotif: (on: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [savedMsg, setSavedMsg] = useState("");
  const update = useMutation({
    mutationFn: async (v: Parameters<typeof api.updateSettings>[0]) => await api.updateSettings(v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", token] });
      setSavedMsg("সেভ হয়েছে ✓");
      setTimeout(() => setSavedMsg(""), 2500);
    },
    onError: () => setSavedMsg("সেভ হয়নি — আবার চেষ্টা করুন"),
  });

  const adminQ = useQuery({
    queryKey: ["admin", token],
    queryFn: () => api.adminStats({ token }),
    enabled: user.isAdmin,
  });

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>আমার তথ্য</SectionTitle>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="st-name" className="mb-1 block text-sm font-medium">নাম</label>
            <input id="st-name" {...FIELDS.updateSettings.name} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="text-sm text-[var(--dim)]">মোবাইল: {bn(user.phone)}</p>
          <div>
            <label htmlFor="st-district" className="mb-1 block text-sm font-medium">আমার জেলা</label>
            <select
              id="st-district"
              className={inputCls}
              value={user.districtEn}
              onChange={(e) => update.mutate({ token, districtEn: e.target.value })}
              aria-label="আমার জেলা"
            >
              {DISTRICTS.map((d) => (
                <option key={d.en} value={d.en}>{d.bn}</option>
              ))}
            </select>
          </div>
          <button type="button" className={primaryBtn} disabled={update.isPending || name.trim().length < 2}
            onClick={() => update.mutate({ token, name: name.trim() })}>
            নাম সেভ করুন
          </button>
          {savedMsg && <p role="status" className="text-sm font-medium text-[var(--accent)]">{savedMsg}</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle>অক্ষরের আকার</SectionTitle>
        <p className="mt-1 text-sm text-[var(--dim)]">পড়তে সুবিধার জন্য বড় অক্ষর বেছে নিন।</p>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="অক্ষরের আকার">
          {([
            { v: "normal", label: "স্বাভাবিক" },
            { v: "large", label: "বড়" },
            { v: "xlarge", label: "আরও বড়" },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={user.fontSize === o.v}
              onClick={() => update.mutate({ token, fontSize: o.v })}
              className={`rounded-lg px-2 py-2 font-medium ${user.fontSize === o.v ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      <NotificationCard hadithNotif={hadithNotif} onToggleHadithNotif={onToggleHadithNotif} />

      <Card>
        <SectionTitle>অফলাইনেও সব চলবে</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          অ্যাপের সব জরুরি তথ্য — নামাজের সময়সূচি, রমজানের ক্যালেন্ডার, দোয়া-হাদিস, খতমের পরিকল্পনা আর ফিতরার সর্বশেষ হার — আপনার ফোনেই সংরক্ষিত থাকে। তাই ইন্টারনেট না থাকলেও অ্যাপ পুরোপুরি চলবে এবং সর্বশেষ তথ্যটাই দেখাবে। আর যখনই ইন্টারনেট আসবে, নতুন আপডেটগুলো নিজে থেকে এসে এখানেই হালনাগাদ হয়ে যাবে — আপনাকে কিছুই করতে হবে না।
        </p>
      </Card>

      <Card>
        <SectionTitle>সেহরির অ্যালার্ম</SectionTitle>
        <label className="mt-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={user.alarmEnabled}
            onChange={(e) => update.mutate({ token, alarmEnabled: e.target.checked })}
            className="h-6 w-6 accent-[#0b3d2e]"
            aria-label="সেহরির অ্যালার্ম চালু"
          />
          <span className="font-medium">অ্যালার্ম চালু রাখুন</span>
        </label>
        <div className="mt-3">
          <label htmlFor="st-alarm-min" className="mb-1 block text-sm font-medium">সেহরি শেষ হওয়ার কত মিনিট আগে বাজবে</label>
          <select
            id="st-alarm-min"
            className={inputCls}
            value={user.alarmMinutes}
            onChange={(e) => update.mutate({ token, alarmMinutes: Number(e.target.value) })}
            aria-label="অ্যালার্মের সময়"
          >
            {[15, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>{bn(m)} মিনিট আগে</option>
            ))}
          </select>
        </div>
        <button type="button" className={`${ghostBtn} mt-3`} onClick={() => playAlarmSound()} aria-label="অ্যালার্মের শব্দ পরীক্ষা করুন">
          অ্যালার্ম পরীক্ষা করুন
        </button>
        <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
          অ্যালার্ম চালু থাকলে নির্ধারিত সময়ে শব্দসহ ব্যানার ও (অনুমতি দিলে) নোটিফিকেশন আসবে — অ্যাপ ব্যাকগ্রাউন্ডে থাকলেও বাজবে, যতক্ষণ ফোন চালু আছে ও অ্যাপটি পুরোপুরি বন্ধ করে দেওয়া হয়নি। ফোন বন্ধ/রিস্টার্ট হলে বা অ্যাপ জোর করে বন্ধ করলে ওয়েব অ্যাপের অ্যালার্ম বাজতে পারে না — তাই নিশ্চিত ঘুম ভাঙানোর জন্য ফোনের নিজের অ্যালার্মও সেট করে রাখুন।
        </p>
      </Card>

      {user.isAdmin && (
        <Card>
          <SectionTitle>অ্যাডমিন — অ্যাপ ব্যবহারের হিসাব</SectionTitle>
          <p className="mt-1 text-sm text-[var(--dim)]">এই তথ্য শুধু আপনি (অ্যাডমিন) দেখতে পারছেন। সাধারণ ব্যবহারকারীরা এটি দেখতে পান না।</p>
          {adminQ.isPending && <p className="mt-2 text-[var(--dim)]">লোড হচ্ছে…</p>}
          {adminQ.data && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-[var(--sage)] p-3">
                  <p className="text-3xl font-bold">{bn(adminQ.data.totalUsers)}</p>
                  <p className="text-sm">মোট অ্যাকাউন্ট</p>
                </div>
                <div className="rounded-lg bg-[var(--sage)] p-3">
                  <p className="text-3xl font-bold">{bn(adminQ.data.active24h)}</p>
                  <p className="text-sm">গত ২৪ ঘণ্টায় ব্যবহার করেছেন</p>
                </div>
                <div className="rounded-lg bg-[var(--sage)] p-3">
                  <p className="text-3xl font-bold">{bn(adminQ.data.active7d)}</p>
                  <p className="text-sm">গত ৭ দিনে ব্যবহার করেছেন</p>
                </div>
                <div className="rounded-lg bg-[var(--sage)] p-3">
                  <p className="text-3xl font-bold">{bn(adminQ.data.totalRozaMarks)}</p>
                  <p className="text-sm">মোট রোজার হিসাব রাখা হয়েছে</p>
                </div>
              </div>
              <h3 className="mt-4 font-semibold">সব অ্যাকাউন্ট</h3>
              <ul className="mt-1 divide-y divide-[var(--border)]">
                {adminQ.data.users.map((u) => (
                  <li key={u.id} className="py-2">
                    <p className="font-medium">
                      {u.name} {u.isAdmin && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-xs font-bold text-[#231a00]">অ্যাডমিন</span>}
                    </p>
                    <p className="text-sm text-[var(--dim)]">
                      {bn(u.phone)} • {findDistrict(u.districtEn).bn} • শেষ ব্যবহার: {bn(new Date(u.lastActiveAt).toLocaleString("en-GB"))}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle>সময়ের উৎস</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
          নামাজ ও সেহরি-ইফতারের সময় প্রতিটি জেলার অবস্থান অনুযায়ী ইসলামিক ফাউন্ডেশনের অনুসৃত পদ্ধতিতে (ফজর ১৮°, হানাফি আসর) হিসাব করা হয়। রমজানের শুরু ও শেষ চাঁদ দেখার উপর নির্ভরশীল — জাতীয় চাঁদ দেখা কমিটি ও ইসলামিক ফাউন্ডেশনের চূড়ান্ত ঘোষণাই প্রযোজ্য।
        </p>
        <button type="button" onClick={onLogout} className="mt-3 w-full rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-700 dark:border-red-800 dark:text-red-300" aria-label="লগ আউট করুন">
          লগ আউট
        </button>
      </Card>
    </div>
  );
}

// ---------- app root ----------

export function App() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string>(() => localStorage.getItem("ramadan-app-token") ?? "");
  const [tab, setTab] = useState<TabId>("home");
  const [todayISO, setTodayISO] = useState(() => isoOf(dhakaNow()));
  const alarmRungFor = useRef<string>("");
  const [alarmBanner, setAlarmBanner] = useState(false);
  const [hadithNotif, setHadithNotif] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ramadan-hadith-notif") !== "off";
    } catch {
      return true;
    }
  });

  function toggleHadithNotif(on: boolean) {
    setHadithNotif(on);
    try {
      localStorage.setItem("ramadan-hadith-notif", on ? "on" : "off");
    } catch {
      // preference just won't persist across restarts
    }
  }

  // keep the Dhaka date fresh
  useEffect(() => {
    const t = setInterval(() => setTodayISO(isoOf(dhakaNow())), 30000);
    return () => clearInterval(t);
  }, []);

  const meQ = useQuery({
    queryKey: ["me", token],
    queryFn: () => api.me({ token }),
    enabled: token.length > 0,
    // Offline: the last known profile opens the app; online it refreshes.
    initialData: () =>
      token ? readCache<ApiResponse<typeof api, "me">>(`me|${token}`) : undefined,
  });
  usePersistCache(token ? `me|${token}` : null, meQ.data);
  const user = meQ.data?.user ?? null;

  useEffect(() => {
    if (token && meQ.data && meQ.data.user === null) {
      localStorage.removeItem("ramadan-app-token");
      setToken("");
    }
  }, [token, meQ.data]);

  // font size (বড় অক্ষর) — scales the whole UI through the root font size
  useEffect(() => {
    const size = !user ? 16 : user.fontSize === "large" ? 18.5 : user.fontSize === "xlarge" ? 21 : 16;
    document.documentElement.style.fontSize = `${size}px`;
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [user]);

  const districtEn = user?.districtEn ?? "Dhaka";
  const todayQ = useQuery({
    queryKey: ["day", districtEn, todayISO],
    queryFn: () => api.getDayTimings({ districtEn, dateISO: todayISO, force: false }),
    enabled: !!user,
    initialData: () =>
      readCache<ApiResponse<typeof api, "getDayTimings">>(`day|${districtEn}|${todayISO}`),
  });
  usePersistCache(`day|${districtEn}|${todayISO}`, todayQ.data);
  const tomorrowISO = addDaysISO(todayISO, 1);
  const tomorrowQ = useQuery({
    queryKey: ["day", districtEn, tomorrowISO],
    queryFn: () => api.getDayTimings({ districtEn, dateISO: tomorrowISO, force: false }),
    enabled: !!user,
    initialData: () =>
      readCache<ApiResponse<typeof api, "getDayTimings">>(`day|${districtEn}|${tomorrowISO}`),
  });
  usePersistCache(`day|${districtEn}|${tomorrowISO}`, tomorrowQ.data);
  const today = todayQ.data?.day;
  const hijriYear = useMemo(() => {
    if (!today) return 1448;
    if (today.hijriMonth < 9) return today.hijriYear;
    if (today.hijriMonth === 9) return today.hijriYear;
    return today.hijriYear + 1;
  }, [today]);
  const calQ = useQuery({
    queryKey: ["cal", districtEn, hijriYear],
    queryFn: () => api.getRamadanCalendar({ districtEn, hijriYear, force: false }),
    enabled: !!user && !!today,
    initialData: () =>
      readCache<ApiResponse<typeof api, "getRamadanCalendar">>(`cal|${districtEn}|${hijriYear}`),
  });
  usePersistCache(`cal|${districtEn}|${hijriYear}`, calQ.data);

  const heartbeat = useMutation({
    mutationFn: async () => await api.heartbeat({ token }),
  });
  useEffect(() => {
    if (user) heartbeat.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sehri alarm watcher — at the set time it plays the sound, shows the
  // banner and sends a notification; if the app returns within 90 minutes
  // after the time, it still fires once as a catch-up.
  useEffect(() => {
    if (!user?.alarmEnabled || !today) return;
    const check = () => {
      const target = timeToMs(today.dateISO, today.timings.fajr) - user.alarmMinutes * 60000;
      const key = `alarm|${today.dateISO}|${user.alarmMinutes}`;
      const now = Date.now();
      if (now >= target && now < target + 90 * 60000 && !alreadyFired(key)) {
        markFired(key);
        alarmRungFor.current = key;
        playAlarmSound();
        setAlarmBanner(true);
        void showNotification(
          "সেহরির অ্যালার্ম",
          `সেহরি শেষ হতে ${bn(user.alarmMinutes)} মিনিট বাকি — আজ সেহরি শেষ ${fmtTime(today.timings.fajr)}। তাড়াতাড়ি সেহরি সেরে নিন।`,
          key,
        );
      }
    };
    check();
    const t = setInterval(check, 15000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, today]);

  // Twice-daily hadith notifications: morning at 08:00 sharp, and in the
  // evening 10 minutes before that day's Iftar in the user's district.
  // Timers are set for today and tomorrow while the app is open or in the
  // background; a slot missed within the last 4 hours is delivered when the
  // app comes back, so the day's hadith is never silently dropped.
  const tomorrow = tomorrowQ.data?.day;
  useEffect(() => {
    if (!user || !today || !hadithNotif) return;
    const timers: number[] = [];
    const days: DayInfo[] = tomorrow ? [today, tomorrow] : [today];
    const fire = (day: DayInfo, slotId: string) => {
      const key = `hadith|${day.dateISO}|${slotId}`;
      if (alreadyFired(key)) return;
      if (notificationPermission() !== "granted") return;
      markFired(key);
      const n = hadithNotification(day);
      void showNotification(n.title, n.body, key);
    };
    const catchUp = () => {
      const now = Date.now();
      for (const day of days) {
        for (const slot of hadithSlotsForDay(day)) {
          if (now >= slot.atMs && now < slot.atMs + 4 * 3600 * 1000) {
            fire(day, slot.id);
          }
        }
      }
    };
    for (const day of days) {
      for (const slot of hadithSlotsForDay(day)) {
        const delay = slot.atMs - Date.now();
        if (delay > 0 && delay < 36 * 3600 * 1000) {
          timers.push(window.setTimeout(() => fire(day, slot.id), delay));
        }
      }
    }
    catchUp();
    const onVis = () => { if (document.visibilityState === "visible") catchUp(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      timers.forEach((t) => clearTimeout(t));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, today, tomorrow, hadithNotif]);

  // Native shell (Android APK): hand the whole schedule to the phone's OS
  // so the hadith reminders and the Sehri alarm fire at the exact time
  // even when the app is fully closed. The sync rebuilds the OS schedule
  // from today, tomorrow and the full Ramadan calendar on every open and
  // whenever the district, alarm setting or hadith toggle changes. In a
  // browser this does nothing — the timers above are the mechanism there.
  const calendarDays = calQ.data?.days;
  useEffect(() => {
    if (!isNativeShell() || !user || !today) return;
    const days: DayInfo[] = [];
    const seen = new Set<string>();
    for (const d of [today, tomorrow, ...(calendarDays ?? [])]) {
      if (d && !seen.has(d.dateISO)) {
        seen.add(d.dateISO);
        days.push(d);
      }
    }
    void syncNativeSchedule({
      days,
      hadithEnabled: hadithNotif,
      alarmEnabled: user.alarmEnabled,
      alarmMinutes: user.alarmMinutes,
      fmtTime,
      bn,
    });
  }, [user, today, tomorrow, calendarDays, hadithNotif]);

  function handleAuthed(t: string) {
    localStorage.setItem("ramadan-app-token", t);
    setToken(t);
    queryClient.invalidateQueries();
  }
  function handleLogout() {
    if (token) void api.logout({ token }).catch(() => undefined);
    // The OS-level schedule belongs to this account — remove it on logout.
    void cancelAllNative();
    localStorage.removeItem("ramadan-app-token");
    setToken("");
    setTab("home");
    queryClient.clear();
  }
  function refreshTimes() {
    if (!user) return;
    void api.getDayTimings({ districtEn, dateISO: todayISO, force: true }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["day", districtEn, todayISO] });
    });
    void api.getRamadanCalendar({ districtEn, hijriYear, force: true }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["cal", districtEn, hijriYear] });
    });
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      {!token || !user ? (
        token && meQ.isPending ? (
          <p className="px-4 py-16 text-center text-[var(--dim)]">লোড হচ্ছে…</p>
        ) : (
          <AuthScreen onAuthed={handleAuthed} />
        )
      ) : (
        <>
          {alarmBanner && (
            <div role="alert" className="fixed inset-x-3 top-3 z-50 rounded-[var(--radius)] bg-[var(--night)] p-4 text-white shadow-xl">
              <p className="text-lg font-bold">সেহরির সময় হয়ে এসেছে!</p>
              <p className="text-sm text-slate-200">সেহরি শেষ হতে {bn(user.alarmMinutes)} মিনিটের কম বাকি থাকতে পারে — তাড়াতাড়ি সেহরি সেরে নিন।</p>
              <button type="button" onClick={() => setAlarmBanner(false)} className="mt-2 rounded-lg bg-[var(--gold)] px-3 py-2 font-semibold text-[#231a00]" aria-label="অ্যালার্ম বন্ধ করুন">
                ঠিক আছে, বন্ধ করুন
              </button>
            </div>
          )}
          <main className="mx-auto w-full max-w-2xl px-3 pb-28 pt-4 sm:px-4">
            <header className="mb-4 flex items-center justify-between">
              <p className="font-semibold">আসসালামু আলাইকুম, {user.name}</p>
              <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-sm font-medium">{findDistrict(user.districtEn).bn}</span>
            </header>
            {todayQ.isError && !today && (
              <Card className="mb-4">
                <p className="font-medium">আজকের সময় আনতে সমস্যা হয়েছে।</p>
                <button type="button" onClick={() => todayQ.refetch()} className={`${ghostBtn} mt-2`} aria-label="আবার চেষ্টা করুন">আবার চেষ্টা করুন</button>
              </Card>
            )}
            {todayQ.isError && today && (
              <p className="mb-4 rounded-lg bg-[var(--sage)] px-3 py-2 text-sm leading-relaxed" role="status">
                এখন ইন্টারনেট নেই — ফোনে সংরক্ষিত সর্বশেষ তথ্যই দেখানো হচ্ছে। ইন্টারনেট এলেই সব নিজে থেকে হালনাগাদ হয়ে যাবে।
              </p>
            )}
            {tab === "home" && (
              <HomeTab
                user={user}
                today={today}
                tomorrow={tomorrowQ.data?.day}
                calendar={calQ.data?.days}
                hijriYear={hijriYear}
                goDua={() => setTab("dua")}
                onRefresh={refreshTimes}
                refreshing={todayQ.isFetching}
              />
            )}
            {tab === "calendar" && <CalendarTab user={user} calendar={calQ.data?.days} todayISO={todayISO} />}
            {tab === "amal" && <AmalTab token={token} hijriYear={hijriYear} calendar={calQ.data?.days} today={today} />}
            {tab === "khatam" && <KhatamTab token={token} hijriYear={hijriYear} today={today} />}
            {tab === "dua" && <DuaTab today={today} />}
            {tab === "hisab" && <HisabTab />}
            {tab === "settings" && (
              <SettingsTab
                user={user}
                token={token}
                onLogout={handleLogout}
                hadithNotif={hadithNotif}
                onToggleHadithNotif={toggleHadithNotif}
              />
            )}
          </main>
          <TabBar tab={tab} setTab={setTab} />
        </>
      )}
    </div>
  );
}
