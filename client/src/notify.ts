// Scheduled local notifications: the Sehri alarm and the twice-daily hadith.
//
// A web app cannot run code while it is fully closed, so scheduling lives in
// the page: while the app is open or sitting in the background, timers fire
// the notifications at their slots; when the user returns, a catch-up check
// delivers anything whose slot passed recently instead of dropping it.
// Every fired slot is remembered in localStorage so nothing repeats.

import { HADITHS, hadithTopic } from "./content";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows a notification now (best effort). Returns true when it was shown. */
export async function showNotification(
  title: string,
  body: string,
  tag: string,
): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return false;
  }
  const options: NotificationOptions = {
    body,
    tag,
    icon: undefined,
    vibrate: [200, 80, 200],
  } as NotificationOptions;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // fall through to the plain constructor
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

// ---------- fired-slot memory (localStorage) ----------

const FIRED_KEY = "ramadan-notif-fired-v1";

function readFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function alreadyFired(key: string): boolean {
  return key in readFired();
}

export function markFired(key: string) {
  try {
    const map = readFired();
    map[key] = Date.now();
    // keep only the last 3 days of markers
    const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
    for (const k of Object.keys(map)) {
      if ((map[k] ?? 0) < cutoff) delete map[k];
    }
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch {
    // storage may be unavailable; timers still dedupe within the session
  }
}

// ---------- hadith of the day ----------

export interface DayLike {
  dateISO: string;
  isRamadan: boolean;
  hijriDay: number;
}

/** Same rotation the home screen uses: Ramadan day in Ramadan, else date-based. */
export function hadithIndexForDay(day: DayLike): number {
  if (day.isRamadan) return (((day.hijriDay - 1) % 30) + 30) % 30;
  const epochDays = Math.floor(Date.parse(`${day.dateISO}T00:00:00Z`) / 86400000);
  return ((epochDays % 30) + 30) % 30;
}

export function hadithNotification(day: DayLike): { title: string; body: string } {
  const idx = hadithIndexForDay(day);
  const h = HADITHS[idx] ?? HADITHS[0]!;
  const topic = hadithTopic(idx);
  return {
    title: topic ? `আজকের হাদিস — ${topic}` : "আজকের হাদিস",
    body: `${h.text}\n— ${h.source}`,
  };
}

/** Absolute ms for a Dhaka wall-clock time on one Gregorian date (YYYY-MM-DD). */
export function dhakaClockMs(dateISO: string, hour: number, minute: number): number {
  const [y = 2027, m = 1, d = 1] = dateISO.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour - 6, minute, 0);
}

// The two daily hadith slots (Dhaka time): the morning one at 08:00 sharp,
// and the evening one 10 minutes before that day's Iftar (Maghrib) in the
// user's own district — so it follows the day's prayer schedule instead of
// a fixed clock time.
export interface HadithSlot {
  id: "morning" | "evening";
  atMs: number;
}

export function hadithSlotsForDay(day: {
  dateISO: string;
  timings: { maghrib: string };
}): HadithSlot[] {
  const slots: HadithSlot[] = [
    { id: "morning", atMs: dhakaClockMs(day.dateISO, 8, 0) },
  ];
  const m = day.timings.maghrib.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const iftarMs = dhakaClockMs(day.dateISO, Number(m[1]), Number(m[2]));
    slots.push({ id: "evening", atMs: iftarMs - 10 * 60 * 1000 });
  }
  return slots;
}
