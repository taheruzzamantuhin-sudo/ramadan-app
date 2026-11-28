// Actions for the Ramadan app: phone+password accounts, per-district prayer
// times from the Aladhan API (Islamic Foundation 18° method, Hanafi Asr),
// Ramadan calendar, Roza tracker, Quran khatam plan, Tasbih counter and an
// admin-only usage view.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { findDistrict } from "./districts";

// ---------- shared shapes ----------

const userShape = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  districtEn: z.string(),
  isAdmin: z.boolean(),
  fontSize: z.enum(["normal", "large", "xlarge"]),
  alarmEnabled: z.boolean(),
  alarmMinutes: z.number(),
});

type UserRow = typeof schema.users.$inferSelect;

function toUserShape(u: UserRow): z.infer<typeof userShape> {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    districtEn: u.districtEn,
    isAdmin: u.isAdmin === 1,
    fontSize: u.fontSize,
    alarmEnabled: u.alarmEnabled === 1,
    alarmMinutes: u.alarmMinutes,
  };
}

const timingsShape = z.object({
  fajr: z.string(),
  sunrise: z.string(),
  dhuhr: z.string(),
  asr: z.string(),
  maghrib: z.string(),
  isha: z.string(),
});

const dayInfoShape = z.object({
  dateISO: z.string(),
  gregorianLabel: z.string(),
  weekdayEn: z.string(),
  hijriDate: z.string(),
  hijriDay: z.number(),
  hijriMonth: z.number(),
  hijriYear: z.number(),
  isRamadan: z.boolean(),
  timings: timingsShape,
});

type DayInfo = z.infer<typeof dayInfoShape>;

// ---------- helpers ----------

// ---------- phone normalisation ----------
// The same Bangladeshi mobile number reaches us in many shapes:
// "01712345678", "+8801712345678", "880 1712-345678", or typed with
// Bengali digits "০১৭১২৩৪৫৬৭৮". All of them must resolve to ONE account,
// so register/login compare only this canonical "01XXXXXXXXX" form.
const BN_TO_EN_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

function canonicalPhone(raw: string): string {
  const latin = raw.replace(/[০-৯]/g, (ch) => BN_TO_EN_DIGITS[ch] ?? ch);
  let digits = latin.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length >= 13) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.length === 10 && digits.startsWith("1")) {
    digits = `0${digits}`;
  }
  return digits;
}

// Finds the account for a phone number in ANY typed format, including
// accounts stored before canonicalisation existed (their stored value is
// canonicalised on the fly for the comparison; the row itself is untouched).
async function findUserByPhone(ctx: Ctx, rawPhone: string): Promise<UserRow | null> {
  const db = ctx.db<typeof schema>();
  const target = canonicalPhone(rawPhone);
  if (!target) return null;
  const direct = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, target))
    .limit(1);
  if (direct[0]) return direct[0];
  const all = await db.select().from(schema.users).limit(1000);
  return all.find((u) => canonicalPhone(u.phone) === target) ?? null;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

async function requireUser(ctx: Ctx, token: string): Promise<UserRow> {
  const db = ctx.db<typeof schema>();
  const srows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .limit(1);
  const sess = srows[0];
  if (!sess) throw new Error("লগইনের মেয়াদ শেষ — আবার লগইন করুন");
  const urows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, sess.userId))
    .limit(1);
  const user = urows[0];
  if (!user) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি — আবার লগইন করুন");
  return user;
}

async function touchActive(ctx: Ctx, userId: number) {
  const db = ctx.db<typeof schema>();
  await db
    .update(schema.users)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.users.id, userId));
}

async function createSession(ctx: Ctx, userId: number): Promise<string> {
  const db = ctx.db<typeof schema>();
  const token = newToken();
  await db.insert(schema.sessions).values({ token, userId });
  return token;
}

// ----- Aladhan API (method=1: 18°/18°, the Islamic Foundation standard;
// ----- school=1: Hanafi Asr) -----

interface AladhanDay {
  timings: Record<string, string>;
  date: {
    readable: string;
    gregorian: { date: string; weekday: { en: string } };
    hijri: {
      date: string;
      day: string;
      month: { number: number };
      year: string;
    };
  };
}

function cleanTime(s: string | undefined): string {
  // Aladhan calendar endpoints return "05:19 (+06)" — keep only HH:MM.
  const m = (s ?? "").match(/\d{1,2}:\d{2}/);
  if (!m) return "";
  const [h = "0", min = "00"] = m[0].split(":");
  return `${h.padStart(2, "0")}:${min}`;
}

function toDayInfo(raw: AladhanDay): DayInfo {
  const g = raw.date.gregorian.date; // DD-MM-YYYY
  const [dd = "01", mm = "01", yyyy = "2027"] = g.split("-");
  const hijriMonth = raw.date.hijri.month.number;
  return {
    dateISO: `${yyyy}-${mm}-${dd}`,
    gregorianLabel: raw.date.readable,
    weekdayEn: raw.date.gregorian.weekday.en,
    hijriDate: raw.date.hijri.date,
    hijriDay: Number(raw.date.hijri.day),
    hijriMonth,
    hijriYear: Number(raw.date.hijri.year),
    isRamadan: hijriMonth === 9,
    timings: {
      fajr: cleanTime(raw.timings.Fajr),
      sunrise: cleanTime(raw.timings.Sunrise),
      dhuhr: cleanTime(raw.timings.Dhuhr),
      asr: cleanTime(raw.timings.Asr),
      maghrib: cleanTime(raw.timings.Maghrib),
      isha: cleanTime(raw.timings.Isha),
    },
  };
}

async function cacheGet(ctx: Ctx, key: string): Promise<string | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.prayerCache)
    .where(eq(schema.prayerCache.cacheKey, key))
    .limit(1);
  return rows[0]?.payload ?? null;
}

async function cacheSet(ctx: Ctx, key: string, payload: string) {
  const db = ctx.db<typeof schema>();
  await db
    .insert(schema.prayerCache)
    .values({ cacheKey: key, payload })
    .onConflictDoUpdate({
      target: schema.prayerCache.cacheKey,
      set: { payload, fetchedAt: new Date() },
    });
}

async function fetchDayInfo(
  ctx: Ctx,
  districtEn: string,
  dateISO: string,
  force: boolean,
): Promise<DayInfo> {
  const key = `day|${districtEn}|${dateISO}`;
  if (!force) {
    const cached = await cacheGet(ctx, key);
    if (cached) return JSON.parse(cached) as DayInfo;
  }
  const d = findDistrict(districtEn);
  const [y = "2027", m = "01", dd = "01"] = dateISO.split("-");
  const url = `https://api.aladhan.com/v1/timings/${dd}-${m}-${y}?latitude=${d.lat}&longitude=${d.lon}&method=1&school=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("নামাজের সময় আনতে সমস্যা হয়েছে — ইন্টারনেট দেখে আবার চেষ্টা করুন");
  }
  const json = (await res.json()) as { data: AladhanDay };
  const info = toDayInfo(json.data);
  await cacheSet(ctx, key, JSON.stringify(info));
  return info;
}

async function fetchRamadanCalendar(
  ctx: Ctx,
  districtEn: string,
  hijriYear: number,
  force: boolean,
): Promise<DayInfo[]> {
  const key = `cal|${districtEn}|${hijriYear}`;
  if (!force) {
    const cached = await cacheGet(ctx, key);
    if (cached) return JSON.parse(cached) as DayInfo[];
  }
  const d = findDistrict(districtEn);
  const url = `https://api.aladhan.com/v1/hijriCalendar/${hijriYear}/9?latitude=${d.lat}&longitude=${d.lon}&method=1&school=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("রমজানের ক্যালেন্ডার আনতে সমস্যা হয়েছে — আবার চেষ্টা করুন");
  }
  const json = (await res.json()) as { data: AladhanDay[] };
  const days = json.data.map(toDayInfo);
  await cacheSet(ctx, key, JSON.stringify(days));
  return days;
}

// ----- Fitra rates (Islamic Foundation Bangladesh) -----
// The rates live in app_settings so a newly announced rate replaces the old
// one without an app rebuild. Until the 1448 announcement exists, the latest
// announced rates are the 1447 ones (National Sadaqatul Fitr Fixing
// Committee, 25 Feb 2026 — Prothom Alo / BSS / bdnews24).

interface FitraPayload {
  hijriYear: number;
  rates: { item: string; rate: number }[];
  sourceName: string;
  sourceUrl: string | null;
  announcedOn: string | null;
  updatedAtISO: string;
}

const DEFAULT_FITRA: FitraPayload = {
  hijriYear: 1447,
  rates: [
    { item: "আটা / গম (১ কেজি ৬৫০ গ্রাম)", rate: 110 },
    { item: "যব (৩ কেজি ৩০০ গ্রাম)", rate: 595 },
    { item: "খেজুর (৩ কেজি ৩০০ গ্রাম)", rate: 2475 },
    { item: "কিশমিশ (৩ কেজি ৩০০ গ্রাম)", rate: 2640 },
    { item: "পনির (৩ কেজি ৩০০ গ্রাম)", rate: 2805 },
  ],
  sourceName: "ইসলামিক ফাউন্ডেশন বাংলাদেশ — জাতীয় সাদাকাতুল ফিতর নির্ধারণ কমিটি",
  sourceUrl: null,
  announcedOn: "2026-02-25",
  updatedAtISO: "2026-02-25T00:00:00.000Z",
};

const fitraShape = z.object({
  hijriYear: z.number(),
  rates: z.array(z.object({ item: z.string(), rate: z.number() })),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  announcedOn: z.string().nullable(),
  updatedAtISO: z.string(),
});

async function getSetting(ctx: Ctx, key: string): Promise<string | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(ctx: Ctx, key: string, value: string) {
  const db = ctx.db<typeof schema>();
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function loadFitra(ctx: Ctx): Promise<FitraPayload> {
  const raw = await getSetting(ctx, "fitra_rates");
  if (!raw) return DEFAULT_FITRA;
  try {
    const parsed = JSON.parse(raw) as FitraPayload;
    if (
      typeof parsed.hijriYear === "number" &&
      Array.isArray(parsed.rates) &&
      parsed.rates.length > 0
    ) {
      return parsed;
    }
  } catch {
    // corrupted payload — fall through to the last announced defaults
  }
  return DEFAULT_FITRA;
}

/** Hijri year of the NEXT Ramadan (the one whose Fitra rate we wait for). */
async function upcomingRamadanYear(ctx: Ctx): Promise<number> {
  const dhaka = new Date(Date.now() + 6 * 3600 * 1000);
  const iso = `${dhaka.getUTCFullYear()}-${String(dhaka.getUTCMonth() + 1).padStart(2, "0")}-${String(dhaka.getUTCDate()).padStart(2, "0")}`;
  const today = await fetchDayInfo(ctx, "Dhaka", iso, false);
  if (today.hijriMonth < 9) return today.hijriYear;
  if (today.hijriMonth === 9) return today.hijriYear;
  return today.hijriYear + 1;
}

// ---------- actions ----------

export const Actions = {
  register: defineAction({
    description: "Creates an account with name, phone number and password, and returns a session token. The first account created becomes the admin.",
    request: z.object({
      name: z.string().trim().min(2).max(60),
      phone: z.string().trim().min(11).max(20),
      password: z.string().min(4).max(64),
      districtEn: z.string().min(2).max(40),
    }),
    response: z.object({ token: z.string(), user: userShape }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const phone = canonicalPhone(args.phone);
      if (phone.length < 11) {
        throw new Error("সঠিক মোবাইল নম্বর দিন (কমপক্ষে ১১ সংখ্যার)");
      }
      const existing = await findUserByPhone(ctx, args.phone);
      if (existing) {
        throw new Error("এই নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে — সাইন আপ নয়, লগইন করুন");
      }
      const all = await db.select({ id: schema.users.id }).from(schema.users);
      const salt = crypto.randomUUID();
      const passwordHash = await hashPassword(args.password, salt);
      const inserted = await db
        .insert(schema.users)
        .values({
          phone,
          name: args.name,
          passwordHash,
          salt,
          districtEn: args.districtEn,
          isAdmin: all.length === 0 ? 1 : 0,
        })
        .returning();
      const user = inserted[0];
      if (!user) throw new Error("অ্যাকাউন্ট তৈরি হয়নি — আবার চেষ্টা করুন");
      const token = await createSession(ctx, user.id);
      return { token, user: toUserShape(user) };
    },
  }),

  login: defineAction({
    description: "Logs in with phone number and password and returns a session token. The phone number is matched format-insensitively (01…, +880…, spaces/dashes, or Bengali digits all find the same existing account).",
    request: z.object({
      phone: z.string().trim().min(11).max(20),
      password: z.string().min(1).max(64),
    }),
    response: z.object({ token: z.string(), user: userShape }),
    async handler(ctx, args) {
      // Any format of the same number (+880…, বাংলা সংখ্যা, ফাঁকসহ) finds
      // the account that was created earlier with that number.
      const user = await findUserByPhone(ctx, args.phone);
      if (!user) throw new Error("ফোন নম্বর বা পাসওয়ার্ড মিলছে না");
      const hash = await hashPassword(args.password, user.salt);
      if (hash !== user.passwordHash) {
        throw new Error("ফোন নম্বর বা পাসওয়ার্ড মিলছে না");
      }
      await touchActive(ctx, user.id);
      const token = await createSession(ctx, user.id);
      return { token, user: toUserShape({ ...user, lastActiveAt: new Date() }) };
    },
  }),

  me: defineAction({
    description: "Returns the logged-in user for a session token, or null when the session is gone.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ user: userShape.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const srows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.token, args.token))
        .limit(1);
      const sess = srows[0];
      if (!sess) return { user: null };
      const urows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, sess.userId))
        .limit(1);
      const user = urows[0];
      if (!user) return { user: null };
      if (Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000) {
        await touchActive(ctx, user.id);
      }
      return { user: toUserShape(user) };
    },
  }),

  logout: defineAction({
    description: "Ends the session for the given token.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.sessions).where(eq(schema.sessions.token, args.token));
      return { ok: true };
    },
  }),

  heartbeat: defineAction({
    description: "Marks the logged-in user as active now (used for the admin usage view).",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const user = await requireUser(ctx, args.token);
      await touchActive(ctx, user.id);
      return { ok: true };
    },
  }),

  updateSettings: defineAction({
    description: "Updates the logged-in user's name, district, font size and Sehri alarm settings.",
    request: z.object({
      token: z.string().min(1).max(200),
      name: z.string().trim().min(2).max(60).optional(),
      districtEn: z.string().min(2).max(40).optional(),
      fontSize: z.enum(["normal", "large", "xlarge"]).optional(),
      alarmEnabled: z.boolean().optional(),
      alarmMinutes: z.number().int().min(5).max(180).optional(),
    }),
    response: z.object({ user: userShape }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      const patch: Partial<UserRow> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.districtEn !== undefined) patch.districtEn = args.districtEn;
      if (args.fontSize !== undefined) patch.fontSize = args.fontSize;
      if (args.alarmEnabled !== undefined) patch.alarmEnabled = args.alarmEnabled ? 1 : 0;
      if (args.alarmMinutes !== undefined) patch.alarmMinutes = args.alarmMinutes;
      if (Object.keys(patch).length > 0) {
        await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id));
      }
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      const updated = rows[0] ?? user;
      return { user: toUserShape(updated) };
    },
  }),

  getDayTimings: defineAction({
    description: "Returns Fajr, Sunrise, Dhuhr, Hanafi Asr, Maghrib and Isha plus Hijri date for one district and one Gregorian date (YYYY-MM-DD), using the Islamic Foundation 18-degree method.",
    request: z.object({
      districtEn: z.string().min(2).max(40),
      dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      force: z.boolean().default(false),
    }),
    response: z.object({ day: dayInfoShape }),
    async handler(ctx, args) {
      const day = await fetchDayInfo(ctx, args.districtEn, args.dateISO, args.force);
      return { day };
    },
  }),

  getRamadanCalendar: defineAction({
    description: "Returns the full Ramadan calendar (every day's Sehri end and Iftar) for one district and Hijri year.",
    request: z.object({
      districtEn: z.string().min(2).max(40),
      hijriYear: z.number().int().min(1400).max(1600),
      force: z.boolean().default(false),
    }),
    response: z.object({ days: z.array(dayInfoShape) }),
    async handler(ctx, args) {
      const days = await fetchRamadanCalendar(ctx, args.districtEn, args.hijriYear, args.force);
      return { days };
    },
  }),

  getMyState: defineAction({
    description: "Returns the logged-in user's Roza marks, Quran khatam check-offs and Tasbih totals for one Hijri year, plus the daily prayer-tracker marks (dateISO -> waqts prayed) for the last 92 days.",
    request: z.object({
      token: z.string().min(1).max(200),
      hijriYear: z.number().int().min(1400).max(1600),
    }),
    response: z.object({
      roza: z.array(z.object({ day: z.number(), status: z.enum(["kept", "qaza"]) })),
      khatamDays: z.array(z.number()),
      tasbih: z.array(z.object({ dhikr: z.string(), count: z.number() })),
      prayers: z.array(
        z.object({
          dateISO: z.string(),
          waqts: z.array(z.enum(["fajr", "dhuhr", "asr", "maghrib", "isha"])),
        }),
      ),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      const roza = await db
        .select()
        .from(schema.rozaMarks)
        .where(
          and(
            eq(schema.rozaMarks.userId, user.id),
            eq(schema.rozaMarks.hijriYear, args.hijriYear),
          ),
        );
      const khatam = await db
        .select()
        .from(schema.khatamMarks)
        .where(
          and(
            eq(schema.khatamMarks.userId, user.id),
            eq(schema.khatamMarks.hijriYear, args.hijriYear),
          ),
        );
      const tasbih = await db
        .select()
        .from(schema.tasbihCounts)
        .where(eq(schema.tasbihCounts.userId, user.id));
      // Prayer tracker: only the recent window the client displays
      // (weekly strip + current month + streak) is returned.
      const dhaka = new Date(Date.now() + 6 * 3600 * 1000);
      const cutoffDt = new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() - 92));
      const cutoff = `${cutoffDt.getUTCFullYear()}-${String(cutoffDt.getUTCMonth() + 1).padStart(2, "0")}-${String(cutoffDt.getUTCDate()).padStart(2, "0")}`;
      const prayerRows = await db
        .select()
        .from(schema.prayerMarks)
        .where(eq(schema.prayerMarks.userId, user.id));
      const waqtOrder = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
      const byDate = new Map<string, Set<(typeof waqtOrder)[number]>>();
      for (const r of prayerRows) {
        if (r.dateISO < cutoff) continue;
        const s = byDate.get(r.dateISO) ?? new Set<(typeof waqtOrder)[number]>();
        s.add(r.waqt);
        byDate.set(r.dateISO, s);
      }
      const prayers = [...byDate.entries()]
        .map(([dateISO, s]) => ({ dateISO, waqts: waqtOrder.filter((w) => s.has(w)) }))
        .filter((p) => p.waqts.length > 0)
        .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
      return {
        roza: roza.map((r) => ({ day: r.day, status: r.status })),
        khatamDays: khatam.filter((k) => k.done === 1).map((k) => k.day),
        tasbih: tasbih.map((t) => ({ dhikr: t.dhikr, count: t.count })),
        prayers,
      };
    },
  }),

  setPrayerMark: defineAction({
    description: "Ticks or unticks one waqt of one Gregorian date in the logged-in user's daily prayer tracker.",
    request: z.object({
      token: z.string().min(1).max(200),
      dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      waqt: z.enum(["fajr", "dhuhr", "asr", "maghrib", "isha"]),
      done: z.boolean(),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      // Only today and the past ~400 days can be marked — the tracker is
      // a habit log, not a future planner.
      const dhaka = new Date(Date.now() + 6 * 3600 * 1000);
      const isoOf = (dt: Date) =>
        `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
      const todayISO = isoOf(dhaka);
      const keepFrom = isoOf(new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() - 400)));
      if (args.dateISO > todayISO || args.dateISO < keepFrom) {
        throw new Error("এই তারিখের জন্য নামাজ চিহ্নিত করা যাবে না");
      }
      const cond = and(
        eq(schema.prayerMarks.userId, user.id),
        eq(schema.prayerMarks.dateISO, args.dateISO),
        eq(schema.prayerMarks.waqt, args.waqt),
      );
      if (!args.done) {
        await db.delete(schema.prayerMarks).where(cond);
      } else {
        const existing = await db.select().from(schema.prayerMarks).where(cond).limit(1);
        if (!existing[0]) {
          await db.insert(schema.prayerMarks).values({
            userId: user.id,
            dateISO: args.dateISO,
            waqt: args.waqt,
          });
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setRozaMark: defineAction({
    description: "Marks one Ramadan day as kept (রেখেছি), qaza (কাজা) or clears the mark for the logged-in user.",
    request: z.object({
      token: z.string().min(1).max(200),
      hijriYear: z.number().int().min(1400).max(1600),
      day: z.number().int().min(1).max(30),
      status: z.enum(["kept", "qaza", "none"]),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      const cond = and(
        eq(schema.rozaMarks.userId, user.id),
        eq(schema.rozaMarks.hijriYear, args.hijriYear),
        eq(schema.rozaMarks.day, args.day),
      );
      if (args.status === "none") {
        await db.delete(schema.rozaMarks).where(cond);
      } else {
        const existing = await db.select().from(schema.rozaMarks).where(cond).limit(1);
        if (existing[0]) {
          await db
            .update(schema.rozaMarks)
            .set({ status: args.status })
            .where(eq(schema.rozaMarks.id, existing[0].id));
        } else {
          await db.insert(schema.rozaMarks).values({
            userId: user.id,
            hijriYear: args.hijriYear,
            day: args.day,
            status: args.status,
          });
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setKhatamDay: defineAction({
    description: "Checks or unchecks one day of the Quran khatam plan for the logged-in user.",
    request: z.object({
      token: z.string().min(1).max(200),
      hijriYear: z.number().int().min(1400).max(1600),
      day: z.number().int().min(1).max(30),
      done: z.boolean(),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      const cond = and(
        eq(schema.khatamMarks.userId, user.id),
        eq(schema.khatamMarks.hijriYear, args.hijriYear),
        eq(schema.khatamMarks.day, args.day),
      );
      if (!args.done) {
        await db.delete(schema.khatamMarks).where(cond);
      } else {
        const existing = await db.select().from(schema.khatamMarks).where(cond).limit(1);
        if (!existing[0]) {
          await db.insert(schema.khatamMarks).values({
            userId: user.id,
            hijriYear: args.hijriYear,
            day: args.day,
            done: 1,
          });
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setTasbih: defineAction({
    description: "Saves the logged-in user's total Tasbih count for one dhikr.",
    request: z.object({
      token: z.string().min(1).max(200),
      dhikr: z.string().min(1).max(60),
      count: z.number().int().min(0).max(10000000),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const user = await requireUser(ctx, args.token);
      const db = ctx.db<typeof schema>();
      const cond = and(
        eq(schema.tasbihCounts.userId, user.id),
        eq(schema.tasbihCounts.dhikr, args.dhikr),
      );
      const existing = await db.select().from(schema.tasbihCounts).where(cond).limit(1);
      if (existing[0]) {
        await db
          .update(schema.tasbihCounts)
          .set({ count: args.count })
          .where(eq(schema.tasbihCounts.id, existing[0].id));
      } else {
        await db.insert(schema.tasbihCounts).values({
          userId: user.id,
          dhikr: args.dhikr,
          count: args.count,
        });
      }
      return { ok: true };
    },
  }),

  getFitraRates: defineAction({
    description: "Returns the currently stored Islamic Foundation Fitra rates (latest announced Hijri year) shown in the Fitra calculator. No login needed.",
    request: z.object({}),
    response: z.object({ fitra: fitraShape }),
    async handler(ctx) {
      const fitra = await loadFitra(ctx);
      return { fitra };
    },
  }),

  saveFitraRates: defineAction({
    description: "Stores newly announced Islamic Foundation Fitra rates for a Hijri year, replacing the stored rates only when the year is not older than the stored one. Called by the automatic rate-check task after it verifies the announcement from reliable published sources.",
    request: z.object({
      hijriYear: z.number().int().min(1440).max(1500),
      rates: z
        .array(
          z.object({
            item: z.string().trim().min(2).max(80),
            rate: z.number().int().min(1).max(100000),
          }),
        )
        .min(3)
        .max(10),
      sourceName: z.string().trim().min(2).max(200),
      sourceUrl: z.string().url().max(500).optional(),
      announcedOn: z.string().trim().max(40).optional(),
    }),
    response: z.object({ ok: z.literal(true), updated: z.boolean() }),
    async handler(ctx, args): Promise<{ ok: true; updated: boolean }> {
      const current = await loadFitra(ctx);
      if (args.hijriYear < current.hijriYear) {
        return { ok: true, updated: false };
      }
      const payload: FitraPayload = {
        hijriYear: args.hijriYear,
        rates: args.rates,
        sourceName: args.sourceName,
        sourceUrl: args.sourceUrl ?? null,
        announcedOn: args.announcedOn ?? null,
        updatedAtISO: new Date().toISOString(),
      };
      await setSetting(ctx, "fitra_rates", JSON.stringify(payload));
      ctx.invalidateQueries();
      return { ok: true, updated: true };
    },
  }),

  refreshFitraRates: defineAction({
    description: "Automatic Fitra rate check (run daily by schedule): if the Islamic Foundation has announced the Fitra rate for the upcoming Ramadan and the stored rate is older, it starts a background research task that verifies the announcement and saves the new rate via saveFitraRates. Does nothing when the stored rate is already current or a check ran recently.",
    request: z.object({}),
    response: z.object({
      status: z.enum(["current", "recently-checked", "check-started", "check-unavailable"]),
      hijriYear: z.number(),
    }),
    async handler(ctx) {
      const stored = await loadFitra(ctx);
      const target = await upcomingRamadanYear(ctx);
      if (stored.hijriYear >= target) {
        return { status: "current" as const, hijriYear: stored.hijriYear };
      }
      const lastCheckRaw = await getSetting(ctx, "fitra_last_check");
      const lastCheck = lastCheckRaw ? Number(lastCheckRaw) : 0;
      if (Date.now() - lastCheck < 20 * 3600 * 1000) {
        return { status: "recently-checked" as const, hijriYear: stored.hijriYear };
      }
      await setSetting(ctx, "fitra_last_check", String(Date.now()));
      const message = [
        `Check whether the Islamic Foundation Bangladesh (ইসলামিক ফাউন্ডেশন বাংলাদেশ) / the National Sadaqatul Fitr Fixing Committee has officially announced the Sadaqatul Fitr (সাদাকাতুল ফিতর / ফিতরা) per-person rates for Ramadan ${target} Hijri.`,
        `The app currently stores the ${stored.hijriYear} Hijri rates (minimum ৳${stored.rates[0]?.rate ?? "?"} for আটা/গম). Only a NEW official announcement for ${target} Hijri counts — do not reuse the ${stored.hijriYear} rates.`,
        "Search the web in Bengali and English (for example: ফিতরা হার " + target + ", সাদাকাতুল ফিতর ঘোষণা, Islamic Foundation fitra rate) and open the actual news reports. Cross-check the full rate list in at least two reliable sources (Prothom Alo, BSS, bdnews24, Dhaka Tribune, or the Islamic Foundation itself).",
        `If the ${target} Hijri rates have been announced, report them through the save action with: hijriYear=${target}, rates = every announced item with its exact per-person taka amount (usually আটা/গম, যব, খেজুর, কিশমিশ, পনির — use the item names and quantities exactly as announced), sourceName = the announcing body, sourceUrl = the exact URL of the news report you read, announcedOn = the announcement date (YYYY-MM-DD) if the report states it.`,
        "If the announcement has NOT been made yet, or the full rate list cannot be verified from reliable sources, do not call the save action at all — just report that the new rate is not out yet. Never guess or carry over amounts.",
      ].join("\n");
      const res = await ctx.agent.spawnTask(message, {
        expectsAction: "saveFitraRates",
        dedupeKey: `fitra-check-${target}`,
      });
      return {
        status: res.ok ? ("check-started" as const) : ("check-unavailable" as const),
        hijriYear: stored.hijriYear,
      };
    },
  }),

  adminStats: defineAction({
    description: "Admin only: total accounts, active users in the last 24 hours and 7 days, and the account list. Rejects non-admin users.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({
      totalUsers: z.number(),
      active24h: z.number(),
      active7d: z.number(),
      totalRozaMarks: z.number(),
      users: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          phone: z.string(),
          districtEn: z.string(),
          isAdmin: z.boolean(),
          createdAt: z.string(),
          lastActiveAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const me = await requireUser(ctx, args.token);
      if (me.isAdmin !== 1) {
        throw new Error("এই তথ্য শুধু অ্যাডমিন দেখতে পারবেন");
      }
      const db = ctx.db<typeof schema>();
      const all = await db
        .select()
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt))
        .limit(500);
      const now = Date.now();
      const marks = await db.select({ id: schema.rozaMarks.id }).from(schema.rozaMarks);
      return {
        totalUsers: all.length,
        active24h: all.filter((u) => now - u.lastActiveAt.getTime() < 24 * 3600 * 1000).length,
        active7d: all.filter((u) => now - u.lastActiveAt.getTime() < 7 * 24 * 3600 * 1000).length,
        totalRozaMarks: marks.length,
        users: all.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          districtEn: u.districtEn,
          isAdmin: u.isAdmin === 1,
          createdAt: u.createdAt.toISOString(),
          lastActiveAt: u.lastActiveAt.toISOString(),
        })),
      };
    },
  }),
} satisfies ActionsModule;
