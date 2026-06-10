/**
 * FlashCard App — Database Queries
 *
 * All SQL in one place. Never write raw SQL outside this file.
 *
 * Conventions
 * ───────────
 *  - All functions are async and accept a `db` parameter (no global state)
 *  - snake_case columns are mapped to camelCase on the way out
 *  - IDs are UUIDs generated with uuid()
 *  - Timestamps are unix milliseconds (Date.now())
 */

import * as SQLite from 'expo-sqlite'
import {
  Card, CardType, Deck, FsrsState, ReviewLog,
  UserProfile, VoiceNote, Rating, AppNotification,
  XP_PER_RATING, xpForLevel, streakMultiplier, STREAK_DAILY_MINIMUM,
} from './schema'

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
}

// ─── Row mappers (snake_case → camelCase) ─────────────────────────────────────

function mapDeck(row: Record<string, unknown>): Deck {
  return {
    id:             row.id as string,
    name:           row.name as string,
    description:    row.description as string | null,
    sourceLanguage: row.source_language as string,
    targetLanguage: row.target_language as string,
    emoji:          row.emoji as string | null,
    newCardLimit:      (row.new_card_limit as number) ?? 40,
    writingExercises:  (row.writing_exercises as number) === 1,
    voiceExercises:    (row.voice_exercises as number) === 1,
    cardCount:         (row.card_count as number) ?? 0,
    dueCount:       (row.due_count as number) ?? 0,
    newCount:       (row.new_count as number) ?? 0,
    createdAt:      row.created_at as number,
    updatedAt:      row.updated_at as number,
  }
}

function mapCard(row: Record<string, unknown>): Card {
  return {
    id:                 row.id as string,
    deckId:             row.deck_id as string,
    front:              row.front as string,
    back:               row.back as string,
    example:            row.example as string | null,
    exampleTranslation: row.example_translation as string | null,
    notes:              row.notes as string | null,
    cardType:           row.card_type as CardType,
    imageUri:           row.image_uri as string | null,
    isSuspended:        Boolean(row.is_suspended),
    studyBothDirections:Boolean(row.study_both_directions),
    createdAt:          row.created_at as number,
    updatedAt:          row.updated_at as number,
  }
}

function mapFsrs(row: Record<string, unknown>, prefix = 'f_'): FsrsState {
  const g = (k: string) => row[`${prefix}${k}`] ?? row[k]
  return {
    cardId:        g('card_id') as string,
    stability:     g('stability') as number,
    difficulty:    g('difficulty') as number,
    elapsedDays:   g('elapsed_days') as number,
    scheduledDays: g('scheduled_days') as number,
    reps:          g('reps') as number,
    lapses:        g('lapses') as number,
    state:         g('state') as number,
    dueDate:       g('due_date') as number,
    lastReview:    g('last_review') as number | null,
  }
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id:               row.id as number,
    displayName:      row.display_name as string,
    currentStreak:    row.current_streak as number,
    longestStreak:    row.longest_streak as number,
    lastStudyDate:    row.last_study_date as string | null,
    totalReviews:     row.total_reviews as number,
    totalXp:          row.total_xp as number,
    level:            row.level as number,
    xpToNextLevel:    row.xp_to_next_level as number,
    totalStudyTimeMs: row.total_study_time_ms as number,
    dailyReviewsCount:(row.daily_reviews_count as number) ?? 0,
    streakFreezes:    (row.streak_freezes as number) ?? 1,
    createdAt:        row.created_at as number,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECKS
// ═══════════════════════════════════════════════════════════════════════════════

/** All non-archived decks with live card + due counts. */
export async function getDecks(db: SQLite.SQLiteDatabase): Promise<Deck[]> {
  const now = Date.now()
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT
      d.*,
      COUNT(DISTINCT c.id) AS card_count,
      COALESCE(SUM(CASE WHEN f.state = 0 OR f.due_date <= ? THEN 1 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN c.study_both_directions = 1 AND fr.card_id IS NOT NULL AND (fr.state = 0 OR fr.due_date <= ?) THEN 1 ELSE 0 END), 0) AS due_count,
      COALESCE(SUM(CASE WHEN f.state = 0 THEN 1 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN c.study_both_directions = 1 AND fr.card_id IS NOT NULL AND fr.state = 0 THEN 1 ELSE 0 END), 0) AS new_count
    FROM decks d
    LEFT JOIN cards      c ON c.deck_id = d.id AND c.is_suspended = 0
    LEFT JOIN fsrs_state f ON f.card_id = c.id
    LEFT JOIN fsrs_state fr ON fr.card_id = (c.id || '_r')
    WHERE d.is_archived = 0
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `, [now, now])
  return rows.map(mapDeck)
}

export async function getDeck(
  db: SQLite.SQLiteDatabase, id: string
): Promise<Deck | null> {
  const now = Date.now()
  const row = await db.getFirstAsync<Record<string, unknown>>(`
    SELECT d.*,
      COUNT(DISTINCT c.id) AS card_count,
      COALESCE(SUM(CASE WHEN f.state = 0 OR f.due_date <= ? THEN 1 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN c.study_both_directions = 1 AND fr.card_id IS NOT NULL AND (fr.state = 0 OR fr.due_date <= ?) THEN 1 ELSE 0 END), 0) AS due_count,
      COALESCE(SUM(CASE WHEN f.state = 0 THEN 1 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN c.study_both_directions = 1 AND fr.card_id IS NOT NULL AND fr.state = 0 THEN 1 ELSE 0 END), 0) AS new_count
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id AND c.is_suspended = 0
    LEFT JOIN fsrs_state f ON f.card_id = c.id
    LEFT JOIN fsrs_state fr ON fr.card_id = (c.id || '_r')
    WHERE d.id = ?
    GROUP BY d.id
  `, [now, now, id] as any[])
  return row ? mapDeck(row) : null
}

export async function createDeck(
  db: SQLite.SQLiteDatabase,
  input: {
    name: string; description?: string
    sourceLanguage: string; targetLanguage: string; emoji?: string
  }
): Promise<Deck> {
  const id = uuid(); const now = Date.now()
  await db.runAsync(
    `INSERT INTO decks (id, name, description, source_language, target_language, emoji, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.description ?? null,
     input.sourceLanguage, input.targetLanguage, input.emoji ?? null, now, now]
  )
  return (await getDeck(db, id))!
}

export async function updateDeck(
  db: SQLite.SQLiteDatabase, id: string,
  patch: Partial<Pick<Deck, 'name' | 'description' | 'emoji' | 'newCardLimit' | 'writingExercises' | 'voiceExercises'>>
): Promise<void> {
  const fields: string[] = []; const values: unknown[] = []
  if (patch.name             !== undefined) { fields.push('name = ?');              values.push(patch.name) }
  if (patch.description      !== undefined) { fields.push('description = ?');       values.push(patch.description) }
  if (patch.emoji            !== undefined) { fields.push('emoji = ?');             values.push(patch.emoji) }
  if (patch.newCardLimit     !== undefined) { fields.push('new_card_limit = ?');    values.push(patch.newCardLimit) }
  if (patch.writingExercises !== undefined) { fields.push('writing_exercises = ?'); values.push(patch.writingExercises ? 1 : 0) }
  if (patch.voiceExercises   !== undefined) { fields.push('voice_exercises = ?');   values.push(patch.voiceExercises ? 1 : 0) }
  if (!fields.length) return
  fields.push('updated_at = ?'); values.push(Date.now(), id)
  await db.runAsync(`UPDATE decks SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function archiveDeck(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE decks SET is_archived = 1, updated_at = ? WHERE id = ?', [Date.now(), id])
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCards(db: SQLite.SQLiteDatabase, deckId: string): Promise<Card[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at DESC', [deckId]
  )
  return rows.map(mapCard)
}

export async function searchCards(
  db: SQLite.SQLiteDatabase, deckId: string, query: string
): Promise<Card[]> {
  const search = `%${query}%`
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM cards WHERE deck_id = ? AND (
      front LIKE ? OR back LIKE ? OR notes LIKE ?
    ) ORDER BY created_at DESC`,
    [deckId, search, search, search]
  )
  return rows.map(mapCard)
}

export async function getCard(db: SQLite.SQLiteDatabase, id: string): Promise<Card | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM cards WHERE id = ?', [id]
  )
  return row ? mapCard(row) : null
}

/** Creates a card and its initial FSRS state (new, due immediately). */
export async function createCard(
  db: SQLite.SQLiteDatabase,
  input: {
    deckId: string; front: string; back: string
    example?: string; exampleTranslation?: string
    notes?: string; cardType?: CardType; imageUri?: string
    studyBothDirections?: boolean
  }
): Promise<Card> {
  const id = uuid(); const now = Date.now()
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cards
         (id, deck_id, front, back, example, example_translation,
          notes, card_type, image_uri, is_suspended, study_both_directions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [id, input.deckId, input.front, input.back,
       input.example ?? null, input.exampleTranslation ?? null,
       input.notes ?? null, input.cardType ?? 'other',
       input.imageUri ?? null, input.studyBothDirections ? 1 : 0, now, now]
    )
    await db.runAsync(
      `INSERT INTO fsrs_state
         (card_id, stability, difficulty, elapsed_days, scheduled_days,
          reps, lapses, state, due_date, last_review)
       VALUES (?, 0, 5, 0, 0, 0, 0, 0, ?, NULL)`,
      [id, now]
    )
    await db.runAsync('UPDATE decks SET updated_at = ? WHERE id = ?', [now, input.deckId])

    // If studying both directions, create a reversed FSRS state row too
    if (input.studyBothDirections) {
      await db.runAsync(
        `INSERT OR IGNORE INTO fsrs_state
           (card_id, stability, difficulty, elapsed_days, scheduled_days,
            reps, lapses, state, due_date, last_review)
         VALUES (?, 0, 5, 0, 0, 0, 0, 0, ?, NULL)`,
        [id + '_r', now]
      )
    }
  })
  return (await getCard(db, id))!
}

export async function updateCard(
  db: SQLite.SQLiteDatabase, id: string,
  patch: Partial<Pick<Card,
    'front' | 'back' | 'example' | 'exampleTranslation' |
    'notes' | 'cardType' | 'imageUri' | 'isSuspended' | 'studyBothDirections'
  >>
): Promise<void> {
  const colMap: Record<string, string> = {
    front: 'front', back: 'back', example: 'example',
    exampleTranslation: 'example_translation', notes: 'notes',
    cardType: 'card_type', imageUri: 'image_uri', isSuspended: 'is_suspended',
    studyBothDirections: 'study_both_directions',
  }
  const fields: string[] = []; const values: unknown[] = []
  for (const [k, col] of Object.entries(colMap)) {
    const v = (patch as Record<string, unknown>)[k]
    if (v !== undefined) { fields.push(`${col} = ?`); values.push(v) }
  }
  if (!fields.length) return
  fields.push('updated_at = ?'); values.push(Date.now(), id)
  await db.runAsync(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`, values as any[])
}

export async function deleteCard(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM cards WHERE id = ?', [id])
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY SESSION
// ═══════════════════════════════════════════════════════════════════════════════

export interface StudyCard extends Card {
  fsrs: FsrsState
  isReversed: boolean   // true = show back as question, front as answer
}

/**
 * Due cards for a deck: all review cards + limited new cards.
 * Review cards: overdue first, then by due date.
 * New cards: limited by deck's newCardLimit (default 40).
 * Cards with studyBothDirections=true are included twice.
 *
 * Returns combined list respecting the daily study cap.
 */
export async function getDueCards(
  db: SQLite.SQLiteDatabase, deckId: string, limit = 100
): Promise<StudyCard[]> {
  const now = Date.now()

  // Get the deck's new card limit
  const deck = await db.getFirstAsync<{ new_card_limit: number }>(
    'SELECT new_card_limit FROM decks WHERE id = ?', [deckId]
  )
  const newCardLimit = deck?.new_card_limit ?? 40

  // Forward cards: all due reviews + limited new cards
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT c.*,
      f.card_id        AS f_card_id,
      f.stability      AS f_stability,
      f.difficulty     AS f_difficulty,
      f.elapsed_days   AS f_elapsed_days,
      f.scheduled_days AS f_scheduled_days,
      f.reps           AS f_reps,
      f.lapses         AS f_lapses,
      f.state          AS f_state,
      f.due_date       AS f_due_date,
      f.last_review    AS f_last_review
    FROM cards c
    JOIN fsrs_state f ON f.card_id = c.id
    WHERE c.deck_id = ? AND c.is_suspended = 0
      AND (
        (f.state != 0 AND f.due_date <= ?) OR
        (f.state = 0 AND c.id IN (
          SELECT id FROM cards WHERE deck_id = ? AND is_suspended = 0
          ORDER BY created_at ASC LIMIT ?
        ))
      )
    ORDER BY
      CASE WHEN f.state = 0 THEN 1 ELSE 0 END ASC,
      f.due_date ASC
    LIMIT ?
  `, [deckId, now, deckId, newCardLimit, limit])

  const forward: StudyCard[] = rows.map((row) => ({
    ...mapCard(row), fsrs: mapFsrs(row), isReversed: false,
  }))

  // Reversed cards — only for studyBothDirections cards
  const reversedRows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT c.*,
      f.card_id        AS f_card_id,
      f.stability      AS f_stability,
      f.difficulty     AS f_difficulty,
      f.elapsed_days   AS f_elapsed_days,
      f.scheduled_days AS f_scheduled_days,
      f.reps           AS f_reps,
      f.lapses         AS f_lapses,
      f.state          AS f_state,
      f.due_date       AS f_due_date,
      f.last_review    AS f_last_review
    FROM cards c
    JOIN fsrs_state f ON f.card_id = (c.id || '_r')
    WHERE c.deck_id = ? AND c.is_suspended = 0
      AND c.study_both_directions = 1
      AND (
        (f.state != 0 AND f.due_date <= ?) OR
        (f.state = 0 AND c.id IN (
          SELECT id FROM cards WHERE deck_id = ? AND is_suspended = 0
          ORDER BY created_at ASC LIMIT ?
        ))
      )
    ORDER BY
      CASE WHEN f.state = 0 THEN 1 ELSE 0 END ASC,
      f.due_date ASC
    LIMIT ?
  `, [deckId, now, deckId, newCardLimit, limit])

  const reversed: StudyCard[] = reversedRows.map((row) => ({
    ...mapCard(row), fsrs: mapFsrs(row), isReversed: true,
  }))

  // Interleave: one forward, one reversed, alternating
  const result: StudyCard[] = []
  const maxLen = Math.max(forward.length, reversed.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < forward.length)  result.push(forward[i])
    if (i < reversed.length) result.push(reversed[i])
  }
  return result.slice(0, limit)
}

/** All studied (non-new) cards for a deck — used by standalone writing/voice practice. */
export async function getPracticeCards(
  db: SQLite.SQLiteDatabase, deckId: string
): Promise<StudyCard[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT c.*,
      f.card_id AS f_card_id, f.stability AS f_stability, f.difficulty AS f_difficulty,
      f.elapsed_days AS f_elapsed_days, f.scheduled_days AS f_scheduled_days,
      f.reps AS f_reps, f.lapses AS f_lapses, f.state AS f_state,
      f.due_date AS f_due_date, f.last_review AS f_last_review
    FROM cards c
    JOIN fsrs_state f ON f.card_id = c.id
    WHERE c.deck_id = ? AND c.is_suspended = 0 AND f.state >= 1
    ORDER BY RANDOM()
  `, [deckId])
  return rows.map(row => ({ ...mapCard(row), fsrs: mapFsrs(row), isReversed: false }))
}

/** Get remaining new cards for a deck after today's study session. */
export async function getRemainingNewCards(
  db: SQLite.SQLiteDatabase, deckId: string
): Promise<Card[]> {
  const deck = await db.getFirstAsync<{ new_card_limit: number }>(
    'SELECT new_card_limit FROM decks WHERE id = ?', [deckId]
  )
  const newCardLimit = deck?.new_card_limit ?? 40

  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT c.* FROM cards c
    JOIN fsrs_state f ON f.card_id = c.id
    WHERE c.deck_id = ? AND c.is_suspended = 0
      AND f.state = 0
    ORDER BY c.created_at ASC
    LIMIT -1 OFFSET ?
  `, [deckId, newCardLimit])

  return rows.map(mapCard)
}

/**
 * Ensures reversed fsrs_state rows exist for cards with studyBothDirections.
 * Call this after createCard when studyBothDirections is true.
 */
export async function ensureReversedFsrsState(
  db: SQLite.SQLiteDatabase, cardId: string
): Promise<void> {
  const reversedId = cardId + '_r'
  const existing = await db.getFirstAsync(
    'SELECT card_id FROM fsrs_state WHERE card_id = ?', [reversedId]
  ).catch(() => null)
  if (existing) return
  await db.runAsync(
    `INSERT OR IGNORE INTO fsrs_state
       (card_id, stability, difficulty, elapsed_days, scheduled_days,
        reps, lapses, state, due_date, last_review)
     VALUES (?, 0, 5, 0, 0, 0, 0, 0, ?, NULL)`,
    [reversedId, Date.now()]
  )
}

/** Total due count across all decks (home screen badge). */
export async function getTotalDueCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM cards c
    JOIN fsrs_state f ON f.card_id = c.id
    JOIN decks d ON d.id = c.deck_id
    WHERE d.is_archived = 0 AND c.is_suspended = 0
      AND (f.state = 0 OR f.due_date <= ?)
  `, [Date.now()])
  return row?.count ?? 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAVING A REVIEW
// ═══════════════════════════════════════════════════════════════════════════════

/** Events fired when a review triggers a milestone. */
export interface ReviewEvents {
  leveledUp:       boolean
  newLevel:        number
  streakMilestone: number | null   // e.g. 7, 14, 21, 30
  xpMilestone:     number | null   // e.g. 500, 1000, 5000
}

const XP_MILESTONES = [500, 1000, 5000, 10000, 50000]

/**
 * Saves a completed review in a single transaction:
 *  1. Updates fsrs_state with next schedule
 *  2. Appends a row to review_log
 *  3. Awards XP, updates streak + level on user_profile
 *
 * Returns ReviewEvents describing any milestones crossed.
 */
export async function saveReview(
  db: SQLite.SQLiteDatabase,
  input: { card: StudyCard; rating: Rating; nextFsrs: FsrsState; timeSpentMs: number; fsrsCardId?: string }
): Promise<ReviewEvents> {
  const { card, rating, nextFsrs, timeSpentMs } = input
  const now = Date.now()
  // Use explicit fsrsCardId if provided (reversed cards), else fall back
  const fsrsKey = card.isReversed ? card.id + '_r' : card.id

  let events: ReviewEvents = { leveledUp: false, newLevel: 0, streakMilestone: null, xpMilestone: null }

  await db.withTransactionAsync(async () => {
    // 1 — FSRS state
    await db.runAsync(
      `UPDATE fsrs_state SET
         stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
         reps = ?, lapses = ?, state = ?, due_date = ?, last_review = ?
       WHERE card_id = ?`,
      [nextFsrs.stability, nextFsrs.difficulty, nextFsrs.elapsedDays,
       nextFsrs.scheduledDays, nextFsrs.reps, nextFsrs.lapses,
       nextFsrs.state, nextFsrs.dueDate, now, fsrsKey]
    )

    // 2 — Review log
    await db.runAsync(
      `INSERT INTO review_log
         (id, card_id, deck_id, rating, state, scheduled_days, elapsed_days, reviewed_at, time_spent_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), card.id, card.deckId, rating, card.fsrs.state,
       nextFsrs.scheduledDays, nextFsrs.elapsedDays, now, timeSpentMs]
    )

    // 3 — XP + streak
    events = await awardXpAndStreak(db, rating, timeSpentMs)
  })

  return events
}

async function awardXpAndStreak(
  db: SQLite.SQLiteDatabase, rating: Rating, timeSpentMs: number
): Promise<ReviewEvents> {
  const profile = await getProfile(db)
  if (!profile) return { leveledUp: false, newLevel: 0, streakMilestone: null, xpMilestone: null }

  const todayStr     = today()
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  // ── Daily review counter ──────────────────────────────────────────────────
  // Reset to 0 if this is a new day, otherwise increment
  const isNewDay        = profile.lastStudyDate !== todayStr
  const newDailyCount   = isNewDay ? 1 : profile.dailyReviewsCount + 1

  // ── Streak logic — only counts when STREAK_DAILY_MINIMUM cards reviewed ──
  // We cross the threshold on exactly the Nth card of the day.
  const crossedThreshold = newDailyCount === STREAK_DAILY_MINIMUM

  let newStreak = profile.currentStreak

  if (isNewDay && profile.currentStreak > 0) {
    // First card of a new day: expire streak if yesterday was missed.
    // lastStudyDate still holds the previous study date here (hasn't been overwritten yet).
    const studiedYesterday = profile.lastStudyDate === yesterdayStr
    if (!studiedYesterday) {
      newStreak = 0  // gap — streak broken; will be set to 1 if threshold crossed below
    }
  }

  if (crossedThreshold) {
    // Just hit the daily minimum for the first time today.
    // By the time we reach card N (N = STREAK_DAILY_MINIMUM > 1), isNewDay is always false
    // because lastStudyDate was already set to today on the first card of the day.
    // Expiry was handled above on the first card, so newStreak is already correct —
    // just add today's qualifying day.
    newStreak = newStreak + 1
  } else if (newDailyCount > STREAK_DAILY_MINIMUM) {
    // Threshold already crossed today — streak already awarded, no change.
  }
  // else: below threshold — streak unchanged (expiry already applied above if isNewDay)

  // ── XP — always awarded per review, streak multiplier applies once threshold met ──
  const multiplier = newDailyCount >= STREAK_DAILY_MINIMUM
    ? streakMultiplier(newStreak)
    : 1   // no multiplier until daily minimum is met
  const earned     = XP_PER_RATING[rating] * multiplier
  const newTotalXp = profile.totalXp + earned

  const oldLevel = profile.level
  let { level } = profile
  let xpToNext  = xpForLevel(level + 1)
  while (newTotalXp >= xpToNext) { level++; xpToNext = xpForLevel(level + 1) }

  // Award 1 streak freeze every time a 7-day milestone is crossed
  const awardFreeze = crossedThreshold && newStreak > 0 && newStreak % 7 === 0 ? 1 : 0

  await db.runAsync(
    `UPDATE user_profile SET
       current_streak      = ?,
       longest_streak      = ?,
       last_study_date     = ?,
       daily_reviews_count = ?,
       total_reviews       = total_reviews + 1,
       total_xp            = ?,
       level               = ?,
       xp_to_next_level    = ?,
       total_study_time_ms = total_study_time_ms + ?,
       streak_freezes      = streak_freezes + ?
     WHERE id = 1`,
    [
      newStreak,
      Math.max(newStreak, profile.longestStreak),
      todayStr,
      newDailyCount,
      newTotalXp,
      level,
      xpToNext,
      timeSpentMs,
      awardFreeze,
    ]
  )

  // ── Detect milestones ──────────────────────────────────────────────────────
  const leveledUp       = level > oldLevel
  const streakMilestone = crossedThreshold && newStreak > 0 && newStreak % 7 === 0 ? newStreak : null
  const xpMilestone     = XP_MILESTONES.find(m => profile.totalXp < m && newTotalXp >= m) ?? null

  return { leveledUp, newLevel: level, streakMilestone, xpMilestone }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE NOTES
// ═══════════════════════════════════════════════════════════════════════════════

export async function getVoiceNotes(db: SQLite.SQLiteDatabase, cardId: string): Promise<VoiceNote[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM voice_notes WHERE card_id = ? ORDER BY created_at DESC', [cardId]
  )
  return rows.map((r) => ({
    id: r.id as string, cardId: r.card_id as string,
    fileUri: r.file_uri as string, durationMs: r.duration_ms as number,
    createdAt: r.created_at as number,
  }))
}

export async function saveVoiceNote(
  db: SQLite.SQLiteDatabase,
  input: { cardId: string; fileUri: string; durationMs: number }
): Promise<VoiceNote> {
  const id = uuid(); const now = Date.now()
  await db.runAsync(
    'INSERT INTO voice_notes (id, card_id, file_uri, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, input.cardId, input.fileUri, input.durationMs, now]
  )
  return { id, cardId: input.cardId, fileUri: input.fileUri, durationMs: input.durationMs, createdAt: now }
}

export async function deleteVoiceNote(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM voice_notes WHERE id = ?', [id])
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

export async function getProfile(db: SQLite.SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM user_profile WHERE id = 1'
  )
  return row ? mapProfile(row) : null
}

export async function updateDisplayName(db: SQLite.SQLiteDatabase, name: string): Promise<void> {
  await db.runAsync('UPDATE user_profile SET display_name = ? WHERE id = 1', [name])
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyActivity {
  date: string          // 'YYYY-MM-DD'
  reviewCount: number
}

/** Daily review counts for the last N days — drives the heatmap. */
export async function getDailyActivity(
  db: SQLite.SQLiteDatabase, days = 35
): Promise<DailyActivity[]> {
  const since = Date.now() - days * 86_400_000
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT
      date(reviewed_at / 1000, 'unixepoch', 'localtime') AS date,
      COUNT(*) AS review_count
    FROM review_log
    WHERE reviewed_at >= ?
    GROUP BY date ORDER BY date ASC
  `, [since])
  return rows.map((r) => ({ date: r.date as string, reviewCount: r.review_count as number }))
}

export interface DeckStats {
  deckId: string; total: number
  newCards: number; learning: number; review: number
  retention: number   // 0–1
  avgStability: number
}

export async function getDeckStats(db: SQLite.SQLiteDatabase, deckId: string): Promise<DeckStats> {
  const s = await db.getFirstAsync<Record<string, unknown>>(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN f.state = 0 THEN 1 ELSE 0 END) AS new_cards,
      SUM(CASE WHEN f.state = 1 THEN 1 ELSE 0 END) AS learning,
      SUM(CASE WHEN f.state = 2 THEN 1 ELSE 0 END) AS review,
      AVG(f.stability) AS avg_stability
    FROM cards c JOIN fsrs_state f ON f.card_id = c.id
    WHERE c.deck_id = ? AND c.is_suspended = 0
  `, [deckId])

  const r = await db.getFirstAsync<Record<string, unknown>>(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS correct
    FROM review_log WHERE deck_id = ?
  `, [deckId])

  const total = (r?.total as number) ?? 0
  return {
    deckId,
    total:        (s?.total as number)        ?? 0,
    newCards:     (s?.new_cards as number)    ?? 0,
    learning:     (s?.learning as number)     ?? 0,
    review:       (s?.review as number)       ?? 0,
    retention:    total > 0 ? ((r?.correct as number) ?? 0) / total : 0,
    avgStability: (s?.avg_stability as number) ?? 0,
  }
}

// ─── XP Stats ─────────────────────────────────────────────────────────────

export interface XpByRating {
  rating: Rating
  label: string
  count: number
  xp: number
}

/** XP earned by each rating type. */
export async function getXpByRating(db: SQLite.SQLiteDatabase): Promise<XpByRating[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT rating, COUNT(*) AS count
    FROM review_log
    GROUP BY rating
    ORDER BY rating ASC
  `)

  const labels: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
  return rows.map((r) => {
    const rating = r.rating as Rating
    const count = (r.count as number) ?? 0
    return {
      rating,
      label: labels[rating],
      count,
      xp: count * XP_PER_RATING[rating],
    }
  })
}

export interface DeckXpStats {
  deckId: string
  deckName: string
  emoji: string | null
  xp: number
  reviews: number
}

/** XP earned per deck. */
export async function getXpByDeck(db: SQLite.SQLiteDatabase): Promise<DeckXpStats[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT
      d.id AS deck_id,
      d.name AS deck_name,
      d.emoji,
      COUNT(rl.id) AS review_count,
      SUM(
        CASE
          WHEN rl.rating = 1 THEN ?
          WHEN rl.rating = 2 THEN ?
          WHEN rl.rating = 3 THEN ?
          WHEN rl.rating = 4 THEN ?
        END
      ) AS total_xp
    FROM decks d
    LEFT JOIN review_log rl ON rl.deck_id = d.id
    WHERE d.is_archived = 0
    GROUP BY d.id
    ORDER BY total_xp DESC
  `, [XP_PER_RATING[1], XP_PER_RATING[2], XP_PER_RATING[3], XP_PER_RATING[4]])

  return rows.map((r) => ({
    deckId: r.deck_id as string,
    deckName: r.deck_name as string,
    emoji: r.emoji as string | null,
    xp: (r.total_xp as number) ?? 0,
    reviews: (r.review_count as number) ?? 0,
  }))
}

export interface DailyXpActivity {
  date: string
  xp: number
}

/** Daily XP earned for the last N days. */
export async function getDailyXpActivity(
  db: SQLite.SQLiteDatabase, days = 35
): Promise<DailyXpActivity[]> {
  const since = Date.now() - days * 86_400_000
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT
      date(reviewed_at / 1000, 'unixepoch', 'localtime') AS date,
      SUM(
        CASE
          WHEN rating = 1 THEN ?
          WHEN rating = 2 THEN ?
          WHEN rating = 3 THEN ?
          WHEN rating = 4 THEN ?
        END
      ) AS daily_xp
    FROM review_log
    WHERE reviewed_at >= ?
    GROUP BY date ORDER BY date ASC
  `, [XP_PER_RATING[1], XP_PER_RATING[2], XP_PER_RATING[3], XP_PER_RATING[4], since])

  return rows.map((r) => ({
    date: r.date as string,
    xp: (r.daily_xp as number) ?? 0,
  }))
}

// ─── Streak history ───────────────────────────────────────────────────────────

export interface StreakRun {
  startDate: string   // 'YYYY-MM-DD'
  endDate:   string
  length:    number
}

/**
 * Recomputes currentStreak and longestStreak from review_log and writes the
 * correct values to user_profile. Call once on app start to repair any drift.
 */
export async function repairStreak(db: SQLite.SQLiteDatabase): Promise<void> {
  const todayStr     = today()
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  // All days that meet the daily minimum, newest first
  const rows = await db.getAllAsync<{ d: string }>(`
    SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS d
    FROM review_log
    GROUP BY d
    HAVING COUNT(*) >= ?
    ORDER BY d DESC
  `, [STREAK_DAILY_MINIMUM])

  const qualifyingDays = rows.map(r => r.d)

  // Count consecutive days ending today or yesterday
  let current = 0
  if (qualifyingDays.length > 0) {
    const latest = qualifyingDays[0]
    if (latest === todayStr || latest === yesterdayStr) {
      let expected = latest
      for (const d of qualifyingDays) {
        if (d === expected) {
          current++
          const prev = new Date(expected + 'T12:00:00Z')
          prev.setUTCDate(prev.getUTCDate() - 1)
          expected = prev.toISOString().slice(0, 10)
        } else {
          break
        }
      }
    }
  }

  // Longest streak: scan all runs
  let longest = current
  let run = 0
  let prevExpected: string | null = null
  for (const d of [...qualifyingDays].reverse()) {
    if (prevExpected === null || d === prevExpected) {
      run++
      if (run > longest) longest = run
    } else {
      run = 1
    }
    const next = new Date(d + 'T12:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    prevExpected = next.toISOString().slice(0, 10)
  }

  await db.runAsync(
    `UPDATE user_profile SET current_streak = ?, longest_streak = MAX(longest_streak, ?) WHERE id = 1`,
    [current, longest]
  )
}

/** Returns past streak runs (consecutive days with >= STREAK_DAILY_MINIMUM reviews), newest first. */
export async function getStreakHistory(
  db: SQLite.SQLiteDatabase, limit = 12
): Promise<StreakRun[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    WITH active_days AS (
      SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS d
      FROM review_log
      GROUP BY d
      HAVING COUNT(*) >= ?
    ),
    rn AS (
      SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS rn FROM active_days
    )
    SELECT MIN(d) AS start_date, MAX(d) AS end_date, COUNT(*) AS length
    FROM rn
    GROUP BY date(d, '-' || rn || ' days')
    ORDER BY end_date DESC
    LIMIT ?
  `, [STREAK_DAILY_MINIMUM, limit])

  return rows.map((r) => ({
    startDate: r.start_date as string,
    endDate:   r.end_date   as string,
    length:    r.length     as number,
  }))
}

// ─── Weekday activity ─────────────────────────────────────────────────────────

export interface WeekdayActivity {
  weekday: number   // 0 = Sun, 1 = Mon … 6 = Sat
  count:   number
}

/** How many reviews were done on each day of the week (all time). */
export async function getWeekdayActivity(
  db: SQLite.SQLiteDatabase
): Promise<WeekdayActivity[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`
    SELECT
      CAST(strftime('%w', date(reviewed_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) AS weekday,
      COUNT(*) AS cnt
    FROM review_log
    GROUP BY weekday
    ORDER BY weekday ASC
  `)
  return rows.map((r) => ({ weekday: r.weekday as number, count: r.cnt as number }))
}

// ─── Best stats ───────────────────────────────────────────────────────────────

export interface BestStats {
  bestWeekCount:  number
  bestMonthCount: number
}

/** All-time best single week and best single month by review count. */
export async function getBestStats(db: SQLite.SQLiteDatabase): Promise<BestStats> {
  const [wRow, mRow] = await Promise.all([
    db.getFirstAsync<Record<string, unknown>>(`
      SELECT MAX(wc) AS best FROM (
        SELECT COUNT(*) AS wc FROM review_log
        GROUP BY strftime('%Y-%W', date(reviewed_at / 1000, 'unixepoch', 'localtime'))
      )
    `),
    db.getFirstAsync<Record<string, unknown>>(`
      SELECT MAX(mc) AS best FROM (
        SELECT COUNT(*) AS mc FROM review_log
        GROUP BY strftime('%Y-%m', date(reviewed_at / 1000, 'unixepoch', 'localtime'))
      )
    `),
  ])
  return {
    bestWeekCount:  (wRow?.best as number) ?? 0,
    bestMonthCount: (mRow?.best as number) ?? 0,
  }
}

// ─── Today's XP ───────────────────────────────────────────────────────────────

/** Base XP earned today (sum of XP_PER_RATING, without streak multiplier). */
export async function getTodayXp(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<Record<string, unknown>>(`
    SELECT SUM(
      CASE
        WHEN rating = 1 THEN ?
        WHEN rating = 2 THEN ?
        WHEN rating = 3 THEN ?
        WHEN rating = 4 THEN ?
      END
    ) AS xp
    FROM review_log
    WHERE date(reviewed_at / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')
  `, [XP_PER_RATING[1], XP_PER_RATING[2], XP_PER_RATING[3], XP_PER_RATING[4]])
  return (row?.xp as number) ?? 0
}

// ─── Weekly XP comparison ─────────────────────────────────────────────────────

export interface WeeklyXpComparison {
  thisWeek: number
  lastWeek: number
}

/** Base XP for the current 7 days vs the previous 7 days. */
export async function getWeeklyXpComparison(
  db: SQLite.SQLiteDatabase
): Promise<WeeklyXpComparison> {
  const activity = await getDailyXpActivity(db, 14)
  const cutoff   = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  let thisWeek = 0, lastWeek = 0
  for (const a of activity) {
    if (a.date > cutoff) thisWeek += a.xp
    else                 lastWeek += a.xp
  }
  return { thisWeek, lastWeek }
}

// ─── Streak freeze ────────────────────────────────────────────────────────────

/**
 * Consumes one freeze token and sets last_study_date to yesterday,
 * so the streak continues when the user next reviews.
 * Returns false if no freeze is available.
 */
export async function useStreakFreeze(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const profile = await getProfile(db)
  if (!profile || profile.streakFreezes <= 0) return false
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  await db.runAsync(
    `UPDATE user_profile SET
       streak_freezes  = streak_freezes - 1,
       last_study_date = ?
     WHERE id = 1 AND streak_freezes > 0`,
    [yesterdayStr]
  )
  return true
}

// ─── Mastered cards count ─────────────────────────────────────────────────────

/** Cards that have reached FSRS Review state (state=2) — i.e. graduated from learning. */
export async function getMasteredCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM cards c
    JOIN fsrs_state f ON f.card_id = c.id
    WHERE f.state = 2
  `)
  return row?.count ?? 0
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function createNotification(
  db: SQLite.SQLiteDatabase,
  n: { type: AppNotification['type']; title: string; body: string }
): Promise<void> {
  await db.runAsync(
    'INSERT INTO notifications (id, type, title, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    [uuid(), n.type, n.title, n.body, Date.now()]
  )
}

export async function getNotifications(
  db: SQLite.SQLiteDatabase, limit = 50
): Promise<AppNotification[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
  return rows.map((r) => ({
    id:        r.id        as string,
    type:      r.type      as AppNotification['type'],
    title:     r.title     as string,
    body:      r.body      as string,
    isRead:    Boolean(r.is_read),
    createdAt: r.created_at as number,
  }))
}

export async function markAllNotificationsRead(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE notifications SET is_read = 1 WHERE is_read = 0')
}

export async function getUnreadNotificationCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0'
  )
  return row?.count ?? 0
}