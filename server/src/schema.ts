// Drizzle schema for the Ramadan app.
// Users sign up with phone + password; every per-user row hangs off users.id.
// Prayer-time API responses are cached in prayer_cache so repeat opens are
// instant and do not re-hit the Aladhan API.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  districtEn: text("district_en").notNull().default("Dhaka"),
  isAdmin: integer("is_admin").notNull().default(0),
  fontSize: text("font_size", { enum: ["normal", "large", "xlarge"] })
    .notNull()
    .default("normal"),
  alarmEnabled: integer("alarm_enabled").notNull().default(0),
  alarmMinutes: integer("alarm_minutes").notNull().default(30),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rozaMarks = sqliteTable("roza_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  hijriYear: integer("hijri_year").notNull(),
  day: integer("day").notNull(),
  status: text("status", { enum: ["kept", "qaza"] }).notNull(),
});

export const khatamMarks = sqliteTable("khatam_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  hijriYear: integer("hijri_year").notNull(),
  day: integer("day").notNull(),
  done: integer("done").notNull().default(1),
});

export const tasbihCounts = sqliteTable("tasbih_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  dhikr: text("dhikr").notNull(),
  count: integer("count").notNull().default(0),
});

export const prayerMarks = sqliteTable("prayer_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  dateISO: text("date_iso").notNull(),
  waqt: text("waqt", { enum: ["fajr", "dhuhr", "asr", "maghrib", "isha"] }).notNull(),
});

// Small key/value store for app-wide settings that must update without a
// rebuild — currently the Islamic Foundation Fitra rates (key "fitra_rates",
// JSON payload) and the last automatic rate-check time ("fitra_last_check").
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const prayerCache = sqliteTable("prayer_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cacheKey: text("cache_key").notNull().unique(),
  payload: text("payload").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
