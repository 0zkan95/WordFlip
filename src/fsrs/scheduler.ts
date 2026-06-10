/**
 * FlashCard App — FSRS Scheduler
 *
 * Thin wrapper around ts-fsrs that translates between our DB types
 * and the ts-fsrs Card/Rating types, so the rest of the app never
 * imports ts-fsrs directly.
 *
 * Usage
 * ─────
 *   import { scheduleCard, previewIntervals } from '@/fsrs/scheduler'
 *
 *   // Get next state after a rating
 *   const next = scheduleCard(card.fsrs, 'good')
 *   await saveReview(db, { card, rating: 3, nextFsrs: next, timeSpentMs })
 *
 *   // Preview all four options before the user taps
 *   const preview = previewIntervals(card.fsrs)
 *   // → { again: '1d', hard: '3d', good: '8d', easy: '21d' }
 */

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State  as FsrsState,
  type Card  as FsrsCard,
  type FSRS,
  type RecordLog,
} from 'ts-fsrs'

import type { FsrsState as DbFsrsState, Rating as DbRating } from '../db/schema'

// ─── Singleton scheduler (default FSRS-5 parameters) ─────────────────────────

let _scheduler: FSRS | null = null

function getScheduler(): FSRS {
  if (!_scheduler) {
    _scheduler = fsrs(generatorParameters({ enable_fuzz: true }))
  }
  return _scheduler
}

// ─── Map our 1-4 rating to ts-fsrs Rating enum ───────────────────────────────

const DB_RATING_MAP: Record<DbRating, FsrsRating> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
}

// ─── Map our DB state to ts-fsrs State enum ───────────────────────────────────

const DB_STATE_MAP: Record<number, FsrsState> = {
  0: FsrsState.New,
  1: FsrsState.Learning,
  2: FsrsState.Review,
  3: FsrsState.Relearning,
}

// ─── Convert our DB FsrsState → ts-fsrs Card ─────────────────────────────────

function toFsrsCard(state: DbFsrsState): FsrsCard {
  if (state.reps === 0 && state.stability === 0) {
    // Truly new card — use the library's empty card
    return createEmptyCard(new Date(state.dueDate))
  }

  return {
    due:           new Date(state.dueDate),
    stability:     state.stability,
    difficulty:    state.difficulty,
    elapsed_days:  state.elapsedDays,
    scheduled_days:state.scheduledDays,
    reps:          state.reps,
    lapses:        state.lapses,
    state:         DB_STATE_MAP[state.state] ?? FsrsState.New,
    last_review:   state.lastReview ? new Date(state.lastReview) : undefined,
  }
}

// ─── Convert ts-fsrs Card → our DB FsrsState ─────────────────────────────────

function fromFsrsCard(card: FsrsCard, cardId: string): DbFsrsState {
  const stateInverse: Record<FsrsState, number> = {
    [FsrsState.New]:        0,
    [FsrsState.Learning]:   1,
    [FsrsState.Review]:     2,
    [FsrsState.Relearning]: 3,
  }

  return {
    cardId,
    stability:     card.stability,
    difficulty:    card.difficulty,
    elapsedDays:   card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps:          card.reps,
    lapses:        card.lapses,
    state:         stateInverse[card.state] ?? 0,
    dueDate:       card.due.getTime(),
    lastReview:    card.last_review ? card.last_review.getTime() : null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Computes the next FSRS state after a rating.
 *
 * @param currentState  - The card's current fsrs_state row from the DB
 * @param rating        - 1=Again 2=Hard 3=Good 4=Easy
 * @returns             - New FsrsState to pass to saveReview()
 */
export function scheduleCard(currentState: DbFsrsState, rating: DbRating): DbFsrsState {
  const scheduler   = getScheduler()
  const fsrsCard    = toFsrsCard(currentState)
  const fsrsRating  = DB_RATING_MAP[rating]
  const now         = new Date()

  const recordLog: RecordLog = scheduler.repeat(fsrsCard, now)
  const next = recordLog[fsrsRating].card

  return fromFsrsCard(next, currentState.cardId)
}

/**
 * Returns the interval (in days) for each of the four ratings
 * WITHOUT actually scheduling the card. Use this to show the
 * "1d / 3d / 8d / 21d" labels under the rating buttons.
 */
export function previewIntervals(currentState: DbFsrsState): {
  again: number; hard: number; good: number; easy: number
} {
  const scheduler  = getScheduler()
  const fsrsCard   = toFsrsCard(currentState)
  const now        = new Date()

  const log = scheduler.repeat(fsrsCard, now)

  return {
    again: log[FsrsRating.Again].card.scheduled_days,
    hard:  log[FsrsRating.Hard].card.scheduled_days,
    good:  log[FsrsRating.Good].card.scheduled_days,
    easy:  log[FsrsRating.Easy].card.scheduled_days,
  }
}

/**
 * Formats an interval number as a short human-readable string.
 *
 * @example
 *   formatInterval(1)   → '1d'
 *   formatInterval(14)  → '2w'
 *   formatInterval(60)  → '2mo'
 */
export function formatInterval(days: number): string {
  if (days < 1)   return '<1d'
  if (days < 7)   return `${days}d`
  if (days < 30)  return `${Math.round(days / 7)}w`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

/**
 * Retrieval probability (0–1) right now given the card's stability.
 * Used to show a "memory strength" indicator.
 *
 * Formula: R = e^(-elapsed / stability)  (FSRS exponential decay)
 */
export function retrievability(state: DbFsrsState): number {
  if (state.stability <= 0 || state.reps === 0) return 0
  const elapsedMs = Date.now() - (state.lastReview ?? state.dueDate)
  const elapsedDays = elapsedMs / 86_400_000
  return Math.exp(-elapsedDays / state.stability)
}