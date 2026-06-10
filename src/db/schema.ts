/**
 * FlashCard App — SQLite Schema
 *
 * Uses expo-sqlite v14+ (the modern async API).
 *
 * Tables
 * ──────
 *  decks          — a collection of cards (one language / topic)
 *  cards          — individual flashcards belonging to a deck
 *  fsrs_state     — FSRS algorithm state per card (separate for clean joins)
 *  review_log     — every single review event (needed for stats + heatmap)
 *  voice_notes    — file paths of user's recorded pronunciations per card
 *  user_profile   — streak, XP, level (single row)
 *
 * Usage
 * ──────
 *  import { getDatabase, runMigrations } from '@/db/schema'
 *
 *  // Call once at app startup (e.g. in App.tsx or _layout.tsx)
 *  const db = await getDatabase()
 *  await runMigrations(db)
 */

import * as SQLite from 'expo-sqlite'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CardType = 'noun' | 'verb' | 'adjective' | 'phrase' | 'other'
export type Rating   = 1 | 2 | 3 | 4   // Again=1 Hard=2 Good=3 Easy=4
export type DeckLanguage = string        // e.g. 'de', 'ja', 'fr' (BCP-47)

export interface Deck {
  id:            string   // uuid
  name:          string
  description:   string | null
  sourceLanguage:DeckLanguage   // language you already know
  targetLanguage:DeckLanguage   // language you are learning
  emoji:         string | null  // flag or icon e.g. '🇩🇪'
  newCardLimit:      number   // max new cards per day (default 40)
  writingExercises:  boolean  // if true, writing round runs after each session
  voiceExercises:    boolean  // if true, voice round runs after each session
  cardCount:         number
  dueCount:      number   // total study entries due (forward + reversed directions)
  newCount:      number   // subset of dueCount that are new (state = 0)
  createdAt:     number   // unix ms
  updatedAt:     number
}

export interface Card {
  id:             string   // uuid
  deckId:         string
  front:          string   // the word / phrase to show
  back:           string   // translation
  example:        string | null   // example sentence (target language)
  exampleTranslation: string | null
  notes:          string | null   // extra info, mnemonics
  cardType:       CardType
  imageUri:       string | null   // local or remote image URI
  isSuspended:    boolean
  studyBothDirections: boolean   // if true, also study back2192front
  createdAt:      number
  updatedAt:      number
}

export interface FsrsState {
  cardId:       string   // 1-to-1 with cards.id
  stability:    number   // S — how long memory lasts (days)
  difficulty:   number   // D — how hard the card is (1–10)
  elapsedDays:  number   // days since last review
  scheduledDays:number   // interval set at last review
  reps:         number   // total successful review count
  lapses:       number   // times rated 'again'
  state:        number   // 0=New 1=Learning 2=Review 3=Relearning
  dueDate:      number   // unix ms — when to show next
  lastReview:   number | null   // unix ms
}

export interface ReviewLog {
  id:           string   // uuid
  cardId:       string
  deckId:       string
  rating:       Rating
  state:        number   // FSRS state before this review
  scheduledDays:number
  elapsedDays:  number
  reviewedAt:   number   // unix ms — used for heatmap + stats
  timeSpentMs:  number   // how long user spent on this card
}

export interface VoiceNote {
  id:        string   // uuid
  cardId:    string
  fileUri:   string   // local file path from expo-av recording
  durationMs:number
  createdAt: number
}

export interface UserProfile {
  id:              number    // always 1 (single row)
  displayName:     string
  currentStreak:   number   // days
  longestStreak:   number   // days
  lastStudyDate:   string | null  // 'YYYY-MM-DD'
  totalReviews:    number
  totalXp:         number
  level:           number
  xpToNextLevel:   number
  totalStudyTimeMs:number
  dailyReviewsCount: number  // reviews done today (resets each new day)
  streakFreezes:   number   // freeze tokens available
  createdAt:       number
}

export interface AppNotification {
  id:        string
  type:      'level_up' | 'streak_milestone' | 'xp_milestone'
  title:     string
  body:      string
  isRead:    boolean
  createdAt: number
}

/** Minimum cards reviewed in a day to count as a streak day. */
export const STREAK_DAILY_MINIMUM = 10

// ─── Database singleton ───────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('flashcard.db')
  // Enable WAL mode for better concurrent read performance
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
  return _db
}

// ─── Migrations ───────────────────────────────────────────────────────────────
//
// Each migration is idempotent (CREATE TABLE IF NOT EXISTS).
// Add new migrations to the array — never edit existing ones.

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      -- ── decks ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS decks (
        id              TEXT    PRIMARY KEY,
        name            TEXT    NOT NULL,
        description     TEXT,
        source_language TEXT    NOT NULL DEFAULT 'en',
        target_language TEXT    NOT NULL,
        emoji           TEXT,
        is_archived     INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );

      -- ── cards ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cards (
        id                   TEXT    PRIMARY KEY,
        deck_id              TEXT    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        front                TEXT    NOT NULL,
        back                 TEXT    NOT NULL,
        example              TEXT,
        example_translation  TEXT,
        notes                TEXT,
        card_type            TEXT    NOT NULL DEFAULT 'other',
        image_uri            TEXT,
        is_suspended         INTEGER NOT NULL DEFAULT 0,
        created_at           INTEGER NOT NULL,
        updated_at           INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);

      -- ── fsrs_state ─────────────────────────────────────────────────────────
      -- One row per card. Created when a card is first reviewed.
      CREATE TABLE IF NOT EXISTS fsrs_state (
        card_id        TEXT    PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
        stability      REAL    NOT NULL DEFAULT 0,
        difficulty     REAL    NOT NULL DEFAULT 5,
        elapsed_days   INTEGER NOT NULL DEFAULT 0,
        scheduled_days INTEGER NOT NULL DEFAULT 0,
        reps           INTEGER NOT NULL DEFAULT 0,
        lapses         INTEGER NOT NULL DEFAULT 0,
        state          INTEGER NOT NULL DEFAULT 0,  -- 0=New 1=Learning 2=Review 3=Relearning
        due_date       INTEGER NOT NULL,             -- unix ms
        last_review    INTEGER                       -- unix ms, nullable
      );

      CREATE INDEX IF NOT EXISTS idx_fsrs_due_date ON fsrs_state(due_date);
      CREATE INDEX IF NOT EXISTS idx_fsrs_state    ON fsrs_state(state);

      -- ── review_log ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS review_log (
        id             TEXT    PRIMARY KEY,
        card_id        TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        deck_id        TEXT    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        rating         INTEGER NOT NULL,   -- 1=Again 2=Hard 3=Good 4=Easy
        state          INTEGER NOT NULL,   -- fsrs state BEFORE this review
        scheduled_days INTEGER NOT NULL DEFAULT 0,
        elapsed_days   INTEGER NOT NULL DEFAULT 0,
        reviewed_at    INTEGER NOT NULL,   -- unix ms
        time_spent_ms  INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_review_log_card_id     ON review_log(card_id);
      CREATE INDEX IF NOT EXISTS idx_review_log_reviewed_at ON review_log(reviewed_at);
      CREATE INDEX IF NOT EXISTS idx_review_log_deck_id     ON review_log(deck_id);

      -- ── voice_notes ────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS voice_notes (
        id          TEXT    PRIMARY KEY,
        card_id     TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        file_uri    TEXT    NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_voice_notes_card_id ON voice_notes(card_id);

      -- ── user_profile ───────────────────────────────────────────────────────
      -- Always a single row (id = 1). Seeded on first run.
      CREATE TABLE IF NOT EXISTS user_profile (
        id                INTEGER PRIMARY KEY DEFAULT 1,
        display_name      TEXT    NOT NULL DEFAULT 'You',
        current_streak    INTEGER NOT NULL DEFAULT 0,
        longest_streak    INTEGER NOT NULL DEFAULT 0,
        last_study_date   TEXT,               -- 'YYYY-MM-DD'
        total_reviews     INTEGER NOT NULL DEFAULT 0,
        total_xp          INTEGER NOT NULL DEFAULT 0,
        level             INTEGER NOT NULL DEFAULT 1,
        xp_to_next_level  INTEGER NOT NULL DEFAULT 500,
        total_study_time_ms INTEGER NOT NULL DEFAULT 0,
        created_at        INTEGER NOT NULL
      );

      -- ── schema_version ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `,
  },
  {
    version: 2,
    sql: `ALTER TABLE cards ADD COLUMN study_both_directions INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 3,
    sql: `ALTER TABLE user_profile ADD COLUMN daily_reviews_count INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 4,
    // Recreate fsrs_state WITHOUT the foreign key constraint on card_id.
    // Reversed cards use id + '_r' which doesn't exist in the cards table,
    // so the FK constraint causes the INSERT to fail.
    sql: `
      CREATE TABLE IF NOT EXISTS fsrs_state_new (
        card_id        TEXT    PRIMARY KEY,
        stability      REAL    NOT NULL DEFAULT 0,
        difficulty     REAL    NOT NULL DEFAULT 5,
        elapsed_days   INTEGER NOT NULL DEFAULT 0,
        scheduled_days INTEGER NOT NULL DEFAULT 0,
        reps           INTEGER NOT NULL DEFAULT 0,
        lapses         INTEGER NOT NULL DEFAULT 0,
        state          INTEGER NOT NULL DEFAULT 0,
        due_date       INTEGER NOT NULL,
        last_review    INTEGER
      );
      INSERT OR IGNORE INTO fsrs_state_new SELECT * FROM fsrs_state;
      DROP TABLE fsrs_state;
      ALTER TABLE fsrs_state_new RENAME TO fsrs_state;
      CREATE INDEX IF NOT EXISTS idx_fsrs_due_date ON fsrs_state(due_date);
      CREATE INDEX IF NOT EXISTS idx_fsrs_state    ON fsrs_state(state);
    `,
  },
  {
    version: 5,
    sql: `ALTER TABLE decks ADD COLUMN new_card_limit INTEGER NOT NULL DEFAULT 40;`,
  },
  {
    version: 6,
    sql: `ALTER TABLE user_profile ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 1;`,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id         TEXT    PRIMARY KEY,
        type       TEXT    NOT NULL,
        title      TEXT    NOT NULL,
        body       TEXT    NOT NULL,
        is_read    INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `,
  },
  {
    version: 8,
    sql: `ALTER TABLE decks ADD COLUMN writing_exercises INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 9,
    sql: `ALTER TABLE decks ADD COLUMN voice_exercises INTEGER NOT NULL DEFAULT 0;`,
  },
]

/**
 * Runs all pending migrations in order.
 * Safe to call every time the app starts — already-applied migrations are skipped.
 */
export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Get current schema version
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `)

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_version'
  )
  const currentVersion = row?.version ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue

    console.log(`[DB] Running migration v${migration.version}`)
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql)
      await db.runAsync(
        'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
        [migration.version]
      )
    })
    console.log(`[DB] Migration v${migration.version} complete`)
  }

  // Seed the user profile row if it doesn't exist
  await seedUserProfile(db)
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUserProfile(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync(
    'SELECT id FROM user_profile WHERE id = 1'
  )
  if (existing) return

  await db.runAsync(
    `INSERT INTO user_profile
       (id, display_name, current_streak, longest_streak, last_study_date,
        total_reviews, total_xp, level, xp_to_next_level, total_study_time_ms, created_at)
     VALUES (1, 'You', 0, 0, NULL, 0, 0, 1, 500, 0, ?)`,
    [Date.now()]
  )
  console.log('[DB] User profile seeded')
}

// ─── XP helpers ───────────────────────────────────────────────────────────────

/** XP required to reach a given level (exponential curve). */
export function xpForLevel(level: number): number {
  return Math.floor(500 * Math.pow(1.4, level - 1))
}

/** XP earned per review based on rating (1–4). */
export const XP_PER_RATING: Record<Rating, number> = {
  1: 5,   // Again  — still earns a little
  2: 10,  // Hard
  3: 15,  // Good
  4: 20,  // Easy
}

/** Streak multiplier: 2× at 7 days, 3× at 30 days. */
export function streakMultiplier(streak: number): number {
  if (streak >= 30) return 3
  if (streak >= 7)  return 2
  return 1
}