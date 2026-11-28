// Native (Capacitor/Android) notification bridge.
//
// This web app is also wrapped into an Android APK with Capacitor (see
// capacitor.config.ts and ANDROID-BUILD.md). Inside that native shell the
// browser Notification API cannot fire while the app is closed, so the
// hadith reminders and the Sehri alarm are instead handed to the phone's
// OS-level local-notification / exact-alarm system through the
// @capacitor/local-notifications plugin: once scheduled, Android itself
// delivers them at the exact time — app open, backgrounded, fully closed,
// or even after a phone restart (the plugin re-registers them on boot).
//
// In a plain browser nothing here activates: isNativeShell() is false and
// the existing in-page timers in notify.ts remain the only mechanism.
//
// Scheduling model: syncNativeSchedule() rebuilds the whole pending set
// from the days the app already knows (today, tomorrow, the coming week
// and the full Ramadan calendar when loaded) — hadith at 08:00 and at
// Iftar−10 min, a prayer hadith at each of the five waqt starts, Sehri
// alarm at Fajr−alarmMinutes — then reconciles against what the OS
// already holds: stale entries are cancelled, missing ones are added, and
// entries whose time or text changed are replaced. It runs on every app
// open and whenever the underlying data or settings change, so the OS
// schedule is always a fresh copy of the app's own schedule.

import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";
import { hadithNotification, hadithSlotsForDay, type DayLike } from "./notify";
import { PRAYER_HADITHS, WAQTS, prayerHadithIndex } from "./prayer-hadiths";

/** True only inside the Capacitor native shell (the Android APK). */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ---------- stable notification ids ----------
// Android notification ids are 32-bit ints. Ours pack the day's epoch-day
// number and a kind digit: id = epochDay * 10 + kind, so the same slot
// always maps to the same id and re-syncs replace instead of duplicate.
const KIND_HADITH_MORNING = 1;
const KIND_HADITH_EVENING = 2;
const KIND_SEHRI_ALARM = 3;
// Waqt prayer-hadith kinds: Fajr 4, Dhuhr 5, Asr 6, Maghrib 7, Isha 8.
const KIND_WAQT = [4, 5, 6, 7, 8];
const KIND_MAX = 8;

function epochDayOf(dateISO: string): number {
  return Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / 86400000);
}

function idFor(dateISO: string, kind: number): number {
  return epochDayOf(dateISO) * 10 + kind;
}

// Android notification channels (created once; re-creating is a no-op).
// The alarm channel is high-importance so it rings and pops up like an
// alarm even on a locked phone.
const HADITH_CHANNEL = "hadith-reminders";
const ALARM_CHANNEL = "sehri-alarm";
const WAQT_CHANNEL = "waqt-hadith";

async function ensureChannels(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: HADITH_CHANNEL,
      name: "প্রতিদিনের হাদিস",
      description: "প্রতিদিন সকাল ৮টায় ও ইফতারের ১০ মিনিট আগে আজকের হাদিস",
      importance: 4,
      vibration: true,
      visibility: 1,
    });
    await LocalNotifications.createChannel({
      id: ALARM_CHANNEL,
      name: "সেহরির অ্যালার্ম",
      description: "সেহরি শেষ হওয়ার আগে বাজানো অ্যালার্ম",
      importance: 5,
      vibration: true,
      visibility: 1,
    });
    await LocalNotifications.createChannel({
      id: WAQT_CHANNEL,
      name: "ওয়াক্তে নামাজের হাদিস",
      description: "প্রতিটি নামাজের ওয়াক্ত শুরুতে নামাজের ফজিলতের হাদিস",
      importance: 4,
      vibration: true,
      visibility: 1,
    });
  } catch {
    // channels are Android-only niceties; scheduling works without them
  }
}

// ---------- permissions ----------

export type NativePermState = "granted" | "denied" | "prompt" | "unsupported";

export async function nativeCheckPermission(): Promise<NativePermState> {
  if (!isNativeShell()) return "unsupported";
  try {
    const s = await LocalNotifications.checkPermissions();
    if (s.display === "granted") return "granted";
    if (s.display === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

export async function nativeRequestPermission(): Promise<NativePermState> {
  if (!isNativeShell()) return "unsupported";
  try {
    const s = await LocalNotifications.requestPermissions();
    if (s.display === "granted") return "granted";
    if (s.display === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/** Whether Android's exact-alarm permission (needed for on-the-minute
 *  delivery on Android 12+) is granted. "unsupported" outside the shell. */
export async function nativeExactAlarmState(): Promise<
  "granted" | "denied" | "unsupported"
> {
  if (!isNativeShell()) return "unsupported";
  try {
    const s = await LocalNotifications.checkExactNotificationSetting();
    return s.exact_alarm === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** Opens the system settings page where the user can allow exact alarms. */
export async function nativeOpenExactAlarmSettings(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // best effort — the settings card explains the manual path too
  }
}

// ---------- immediate notification (test button / parity with web) ----------

export async function nativeShowNow(
  title: string,
  body: string,
): Promise<boolean> {
  if (!isNativeShell()) return false;
  if ((await nativeCheckPermission()) !== "granted") return false;
  try {
    await ensureChannels();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 900001,
          title,
          body,
          channelId: HADITH_CHANNEL,
          schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- the schedule sync ----------

export interface NativeSyncDay extends DayLike {
  timings: {
    fajr: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
}

export interface NativeSyncInput {
  days: NativeSyncDay[];
  hadithEnabled: boolean;
  waqtHadithEnabled: boolean;
  alarmEnabled: boolean;
  alarmMinutes: number;
  /** "ভোর ৫:১৯" style label for the alarm body, built by the caller. */
  fmtTime: (hhmm: string) => string;
  /** Bengali digits for the alarm body, built by the caller. */
  bn: (n: number | string) => string;
}

interface Wanted {
  id: number;
  title: string;
  body: string;
  atMs: number;
  channelId: string;
}

/** Dhaka-local wall time ("HH:MM" on dateISO) as epoch ms (Dhaka = UTC+6). */
function localMs(dateISO: string, hhmm: string): number | null {
  const m = (hhmm ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [y = 2027, mo = 1, d = 1] = dateISO.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, Number(m[1]) - 6, Number(m[2]), 0);
}

function buildWanted(input: NativeSyncInput): Wanted[] {
  const out: Wanted[] = [];
  const now = Date.now();
  const seen = new Set<string>();
  for (const day of input.days) {
    if (!day?.dateISO || seen.has(day.dateISO)) continue;
    seen.add(day.dateISO);
    if (input.hadithEnabled) {
      const n = hadithNotification(day);
      for (const slot of hadithSlotsForDay(day)) {
        const id = idFor(
          day.dateISO,
          slot.id === "morning" ? KIND_HADITH_MORNING : KIND_HADITH_EVENING,
        );
        if (slot.atMs > now) {
          out.push({
            id,
            title: n.title,
            body: n.body,
            atMs: slot.atMs,
            channelId: HADITH_CHANNEL,
          });
        }
      }
    }
    if (input.waqtHadithEnabled) {
      // One prayer hadith at the start of each of the five waqts, from
      // the verified rotating set — a different hadith per waqt per day.
      WAQTS.forEach((w, wi) => {
        const kind = KIND_WAQT[wi];
        if (kind === undefined) return;
        const atMs = localMs(day.dateISO, day.timings[w.key]);
        if (atMs === null || atMs <= now) return;
        const h =
          PRAYER_HADITHS[
            prayerHadithIndex(epochDayOf(day.dateISO), wi, PRAYER_HADITHS.length)
          ];
        if (!h) return;
        out.push({
          id: idFor(day.dateISO, kind),
          title: `${w.label} — নামাজের হাদিস`,
          body: `${h.text}\n— ${h.source}`,
          atMs,
          channelId: WAQT_CHANNEL,
        });
      });
    }
    if (input.alarmEnabled && day.isRamadan) {
      const m = day.timings.fajr.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        const [y = 2027, mo = 1, d = 1] = day.dateISO.split("-").map(Number);
        const fajrMs = Date.UTC(y, mo - 1, d, Number(m[1]) - 6, Number(m[2]), 0);
        const atMs = fajrMs - input.alarmMinutes * 60000;
        if (atMs > now) {
          out.push({
            id: idFor(day.dateISO, KIND_SEHRI_ALARM),
            title: "সেহরির অ্যালার্ম",
            body: `সেহরি শেষ হতে ${input.bn(input.alarmMinutes)} মিনিট বাকি — আজ সেহরি শেষ ${input.fmtTime(day.timings.fajr)}। তাড়াতাড়ি সেহরি সেরে নিন।`,
            atMs,
            channelId: ALARM_CHANNEL,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Reconciles the OS-level pending notifications with the app's schedule.
 * Returns how many notifications are now scheduled with the OS, or -1 when
 * not in the native shell / permission missing / anything failed (the web
 * fallback timers keep working regardless).
 */
export async function syncNativeSchedule(
  input: NativeSyncInput,
): Promise<number> {
  if (!isNativeShell()) return -1;
  if ((await nativeCheckPermission()) !== "granted") return -1;
  try {
    await ensureChannels();
    const wanted = buildWanted(input);
    const wantedById = new Map(wanted.map((w) => [w.id, w]));

    const pending = await LocalNotifications.getPending();

    // Cancel anything the OS holds that we no longer want (our ids only —
    // the id arithmetic marks them: epochDay*10 + 1..8).
    const toCancel = pending.notifications
      .filter((p) => p.id % 10 >= 1 && p.id % 10 <= KIND_MAX && !wantedById.has(p.id))
      .map((p) => ({ id: p.id }));
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel });
    }

    // Re-scheduling every wanted entry is simplest and always consistent:
    // the plugin replaces a pending notification scheduled again with the
    // same id, so changed times/text refresh in place. The set is at most
    // ~240 entries (30 days × 8).
    const toSchedule: LocalNotificationSchema[] = wanted.map((w) => ({
      id: w.id,
      title: w.title,
      body: w.body,
      channelId: w.channelId,
      schedule: { at: new Date(w.atMs), allowWhileIdle: true },
    }));
    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
    return wanted.length;
  } catch {
    return -1;
  }
}

/** Removes every OS-scheduled notification this app owns (logout / off). */
export async function cancelAllNative(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications
      .filter((p) => p.id % 10 >= 1 && p.id % 10 <= KIND_MAX)
      .map((p) => ({ id: p.id }));
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours });
    }
  } catch {
    // nothing to clean up
  }
}
