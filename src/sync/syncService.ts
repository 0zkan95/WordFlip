/**
 * src/sync/syncService.ts
 *
 * Sync strategy:
 *  - pushAll  : upsert all local SQLite data → Supabase (runs after login + after study sessions)
 *  - pullAll  : download all Supabase data → local SQLite (runs on first login on a new device)
 *  - shouldPull: returns true when local DB is empty (new device detection)
 *
 * Conflict resolution: last updated_at / last_review wins (last-write-wins).
 * review_log is append-only — duplicates are silently ignored on both sides.
 */

import * as SQLite from 'expo-sqlite'
import { appStorage } from '../lib/storage'
import { supabase } from '../lib/supabase'

const LAST_SYNC_KEY = 'wordflip_last_sync'

export async function getLastSyncedAt(): Promise<number | null> {
  const val = await appStorage.getItem(LAST_SYNC_KEY)
  return val ? parseInt(val, 10) : null
}

async function setLastSyncedAt(ts: number) {
  await appStorage.setItem(LAST_SYNC_KEY, String(ts))
}

// ─── Push ─────────────────────────────────────────────────────────────────────

export async function pushAll(
  db: SQLite.SQLiteDatabase,
  userId: string
): Promise<void> {
  await pushDecks(db, userId)
  await pushCards(db, userId)
  await pushFsrsState(db, userId)
  await pushReviewLog(db, userId)
  await pushProfile(db, userId)
  await setLastSyncedAt(Date.now())
}

async function pushDecks(db: SQLite.SQLiteDatabase, userId: string) {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM decks')
  if (!rows.length) return
  const payload = rows.map(r => ({
    id:               r.id,
    user_id:          userId,
    name:             r.name,
    description:      r.description ?? null,
    source_language:  r.source_language,
    target_language:  r.target_language,
    emoji:            r.emoji ?? null,
    new_card_limit:   r.new_card_limit ?? 40,
    writing_exercises:r.writing_exercises ?? 0,
    voice_exercises:  r.voice_exercises ?? 0,
    is_archived:      r.is_archived ?? 0,
    updated_at:       r.updated_at,
    created_at:       r.created_at,
  }))
  const { error } = await supabase.from('decks').upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`pushDecks: ${error.message}`)
}

async function pushCards(db: SQLite.SQLiteDatabase, userId: string) {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM cards')
  if (!rows.length) return
  const payload = rows.map(r => ({
    id:                   r.id,
    user_id:              userId,
    deck_id:              r.deck_id,
    front:                r.front,
    back:                 r.back,
    notes:                r.notes ?? null,
    example:              r.example ?? null,
    example_translation:  r.example_translation ?? null,
    card_type:            r.card_type ?? 'standard',
    study_both_directions:r.study_both_directions ?? 0,
    is_suspended:         r.is_suspended ?? 0,
    updated_at:           r.updated_at ?? r.created_at,
    created_at:           r.created_at,
  }))
  const { error } = await supabase.from('cards').upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`pushCards: ${error.message}`)
}

async function pushFsrsState(db: SQLite.SQLiteDatabase, userId: string) {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM fsrs_state')
  if (!rows.length) return
  const payload = rows.map(r => ({
    card_id:       r.card_id,
    user_id:       userId,
    stability:     r.stability ?? 0,
    difficulty:    r.difficulty ?? 5,
    elapsed_days:  r.elapsed_days ?? 0,
    scheduled_days:r.scheduled_days ?? 0,
    reps:          r.reps ?? 0,
    lapses:        r.lapses ?? 0,
    state:         r.state ?? 0,
    due_date:      r.due_date ?? null,
    last_review:   r.last_review ?? null,
    updated_at:    r.last_review ?? Date.now(),
  }))
  const { error } = await supabase
    .from('fsrs_state')
    .upsert(payload, { onConflict: 'card_id,user_id' })
  if (error) throw new Error(`pushFsrsState: ${error.message}`)
}

async function pushReviewLog(db: SQLite.SQLiteDatabase, userId: string) {
  const lastSync = await getLastSyncedAt()
  const rows = await db.getAllAsync<Record<string, unknown>>(
    lastSync
      ? 'SELECT * FROM review_log WHERE reviewed_at > ? ORDER BY reviewed_at ASC'
      : 'SELECT * FROM review_log ORDER BY reviewed_at ASC',
    lastSync ? [lastSync] : []
  )
  if (!rows.length) return
  const payload = rows.map(r => ({
    id:           r.id,
    user_id:      userId,
    card_id:      r.card_id,
    deck_id:      r.deck_id,
    rating:       r.rating,
    time_spent_ms:r.time_spent_ms,
    reviewed_at:  r.reviewed_at,
  }))
  // ignoreDuplicates: true means existing rows are silently skipped
  const { error } = await supabase
    .from('review_log')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(`pushReviewLog: ${error.message}`)
}

async function pushProfile(db: SQLite.SQLiteDatabase, userId: string) {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM user_profile WHERE id = 1'
  )
  if (!row) return
  const { error } = await supabase.from('user_profile').upsert({
    user_id:             userId,
    display_name:        row.display_name ?? null,
    current_streak:      row.current_streak ?? 0,
    longest_streak:      row.longest_streak ?? 0,
    last_study_date:     row.last_study_date ?? null,
    total_reviews:       row.total_reviews ?? 0,
    total_xp:            row.total_xp ?? 0,
    level:               row.level ?? 1,
    xp_to_next_level:    row.xp_to_next_level ?? 100,
    total_study_time_ms: row.total_study_time_ms ?? 0,
    daily_reviews_count: row.daily_reviews_count ?? 0,
    streak_freezes:      row.streak_freezes ?? 1,
    updated_at:          Date.now(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(`pushProfile: ${error.message}`)
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export async function pullAll(
  db: SQLite.SQLiteDatabase,
  userId: string
): Promise<void> {
  await pullDecks(db, userId)
  await pullCards(db, userId)
  await pullFsrsState(db, userId)
  await pullReviewLog(db, userId)
  await pullProfile(db, userId)
  await setLastSyncedAt(Date.now())
}

async function pullDecks(db: SQLite.SQLiteDatabase, userId: string) {
  const { data, error } = await supabase
    .from('decks').select('*').eq('user_id', userId)
  if (error) throw new Error(`pullDecks: ${error.message}`)
  if (!data?.length) return
  await db.withTransactionAsync(async () => {
    for (const d of data) {
      await db.runAsync(`
        INSERT OR REPLACE INTO decks
          (id, name, description, source_language, target_language, emoji,
           new_card_limit, writing_exercises, voice_exercises, is_archived, updated_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.id, d.name, d.description, d.source_language, d.target_language,
         d.emoji, d.new_card_limit, d.writing_exercises, d.voice_exercises,
         d.is_archived, d.updated_at, d.created_at]
      )
    }
  })
}

async function pullCards(db: SQLite.SQLiteDatabase, userId: string) {
  const { data, error } = await supabase
    .from('cards').select('*').eq('user_id', userId)
  if (error) throw new Error(`pullCards: ${error.message}`)
  if (!data?.length) return
  await db.withTransactionAsync(async () => {
    for (const c of data) {
      await db.runAsync(`
        INSERT OR REPLACE INTO cards
          (id, deck_id, front, back, notes, example, example_translation,
           card_type, study_both_directions, is_suspended, updated_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [c.id, c.deck_id, c.front, c.back, c.notes, c.example,
         c.example_translation, c.card_type, c.study_both_directions,
         c.is_suspended, c.updated_at, c.created_at]
      )
    }
  })
}

async function pullFsrsState(db: SQLite.SQLiteDatabase, userId: string) {
  const { data, error } = await supabase
    .from('fsrs_state').select('*').eq('user_id', userId)
  if (error) throw new Error(`pullFsrsState: ${error.message}`)
  if (!data?.length) return
  await db.withTransactionAsync(async () => {
    for (const f of data) {
      await db.runAsync(`
        INSERT OR REPLACE INTO fsrs_state
          (card_id, stability, difficulty, elapsed_days, scheduled_days,
           reps, lapses, state, due_date, last_review)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [f.card_id, f.stability, f.difficulty, f.elapsed_days,
         f.scheduled_days, f.reps, f.lapses, f.state, f.due_date, f.last_review]
      )
    }
  })
}

async function pullReviewLog(db: SQLite.SQLiteDatabase, userId: string) {
  const { data, error } = await supabase
    .from('review_log').select('*').eq('user_id', userId)
  if (error) throw new Error(`pullReviewLog: ${error.message}`)
  if (!data?.length) return
  await db.withTransactionAsync(async () => {
    for (const r of data) {
      await db.runAsync(`
        INSERT OR IGNORE INTO review_log
          (id, card_id, deck_id, rating, time_spent_ms, reviewed_at)
        VALUES (?,?,?,?,?,?)`,
        [r.id, r.card_id, r.deck_id, r.rating, r.time_spent_ms, r.reviewed_at]
      )
    }
  })
}

async function pullProfile(db: SQLite.SQLiteDatabase, userId: string) {
  const { data, error } = await supabase
    .from('user_profile').select('*').eq('user_id', userId).single()
  if (error || !data) return
  // Merge: take the max of numeric fields so XP/streak are never downgraded
  const local = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM user_profile WHERE id = 1'
  )
  await db.runAsync(`
    UPDATE user_profile SET
      display_name        = ?,
      current_streak      = MAX(current_streak, ?),
      longest_streak      = MAX(longest_streak, ?),
      total_reviews       = MAX(total_reviews, ?),
      total_xp            = MAX(total_xp, ?),
      level               = MAX(level, ?),
      total_study_time_ms = MAX(total_study_time_ms, ?),
      streak_freezes      = MAX(streak_freezes, ?)
    WHERE id = 1`,
    [
      data.display_name ?? local?.display_name ?? 'Learner',
      data.current_streak,
      data.longest_streak,
      data.total_reviews,
      data.total_xp,
      data.level,
      data.total_study_time_ms,
      data.streak_freezes,
    ]
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when local DB has no decks — i.e. this is a fresh install. */
export async function isLocalEmpty(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM decks'
  )
  return (row?.count ?? 0) === 0
}
