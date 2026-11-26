DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  district_en TEXT NOT NULL DEFAULT 'Dhaka',
  is_admin INTEGER NOT NULL DEFAULT 0,
  font_size TEXT NOT NULL DEFAULT 'normal',
  alarm_enabled INTEGER NOT NULL DEFAULT 0,
  alarm_minutes INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE roza_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  hijri_year INTEGER NOT NULL,
  day INTEGER NOT NULL,
  status TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE khatam_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  hijri_year INTEGER NOT NULL,
  day INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE tasbih_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  dhikr TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE prayer_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
