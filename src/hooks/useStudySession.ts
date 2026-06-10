/**
 * useStudySession — manages the full study session lifecycle
 *
 * Supports:
 *  - Forward cards (front → back)
 *  - Reverse cards (back → front) for cards with studyBothDirections = true
 *    Reversed cards get their own FSRS state stored with id + '_r' suffix
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as SQLite from 'expo-sqlite'
import { getDueCards, saveReview, StudyCard, ReviewEvents } from '../db/queries'
import { scheduleCard } from '../fsrs/scheduler'
import type { FsrsState, Rating } from '../db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummary {
  totalCards:  number
  correct:     number
  again:       number
  totalTimeMs: number
  xpEarned:    number
}

export interface StudyEntry {
  card:      StudyCard
  reversed:  boolean     // true = show back as question, front as answer
  fsrsId:    string      // card.id or card.id + '_r'
}

interface UseStudySessionResult {
  currentEntry:       StudyEntry | null
  isLoading:          boolean
  isDone:             boolean
  progress:           { done: number; total: number }
  summary:            SessionSummary | null
  entries:            StudyEntry[]
  rate:               (rating: Rating) => Promise<void>
  reset:              () => void
  pendingEvents:      ReviewEvents[]
  clearPendingEvents: () => void
}

const XP: Record<Rating, number> = { 1: 5, 2: 10, 3: 15, 4: 20 }

// ─── Build deck from due cards, expanding reversed cards ──────────────────────

function buildSessionQueue(cards: StudyCard[]): StudyEntry[] {
  // getDueCards already returns both forward (isReversed: false) and reversed
  // (isReversed: true) StudyCards separately — just wrap each into a StudyEntry.
  const entries: StudyEntry[] = cards.map((card) => ({
    card,
    reversed: card.isReversed,
    fsrsId:   card.isReversed ? card.id + '_r' : card.id,
  }))

  // Shuffle so forward and reverse of the same card don't appear back-to-back
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[entries[i], entries[j]] = [entries[j], entries[i]]
  }

  return entries
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStudySession(
  deckId: string,
  db: SQLite.SQLiteDatabase | null
): UseStudySessionResult {
  const [entries,       setEntries]       = useState<StudyEntry[]>([])
  const [index,         setIndex]         = useState(0)
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDone,        setIsDone]        = useState(false)
  const [summary,       setSummary]       = useState<SessionSummary | null>(null)
  const [pendingEvents, setPendingEvents] = useState<ReviewEvents[]>([])

  const statsRef    = useRef({ correct: 0, again: 0, xp: 0, startMs: Date.now() })
  const cardStartRef= useRef(Date.now())

  useEffect(() => {
    if (!db) return
    setIsLoading(true)
    statsRef.current = { correct: 0, again: 0, xp: 0, startMs: Date.now() }

    getDueCards(db, deckId)
      .then((due) => {
        const queue = buildSessionQueue(due)
        setEntries(queue)
        setIndex(0)
        setIsDone(queue.length === 0)
        if (queue.length === 0) {
          setSummary({ totalCards: 0, correct: 0, again: 0, totalTimeMs: 0, xpEarned: 0 })
        }
      })
      .catch((e) => console.error('[useStudySession]', e))
      .finally(() => setIsLoading(false))
  }, [deckId, db])

  useEffect(() => { cardStartRef.current = Date.now() }, [index])

  const rate = useCallback(async (rating: Rating) => {
    if (!db || index >= entries.length) return

    const entry       = entries[index]
    const timeSpentMs = Date.now() - cardStartRef.current

    // Build a synthetic FsrsState for reversed cards using the _r suffix id
    const fsrsForEntry: FsrsState = entry.reversed
      ? { ...entry.card.fsrs, cardId: entry.fsrsId }
      : entry.card.fsrs

    const nextFsrs = scheduleCard(fsrsForEntry, rating)

    statsRef.current.xp      += XP[rating]
    statsRef.current.correct += rating >= 3 ? 1 : 0
    statsRef.current.again   += rating === 1 ? 1 : 0

    try {
      const events = await saveReview(db, {
        card: entry.card,
        rating,
        nextFsrs,
        timeSpentMs,
        fsrsCardId: entry.fsrsId,
      })
      if (events.leveledUp || events.streakMilestone != null || events.xpMilestone != null) {
        setPendingEvents((prev) => [...prev, events])
      }
    } catch (e) {
      console.error('[useStudySession] saveReview:', e)
    }

    const next = index + 1
    if (next >= entries.length) {
      const { correct, again, xp, startMs } = statsRef.current
      setSummary({
        totalCards:  entries.length,
        correct, again,
        totalTimeMs: Date.now() - startMs,
        xpEarned:    xp,
      })
      setIsDone(true)
    } else {
      setIndex(next)
    }
  }, [db, entries, index])

  const reset = useCallback(() => {
    if (!db) return
    setIsLoading(true)
    statsRef.current = { correct: 0, again: 0, xp: 0, startMs: Date.now() }

    getDueCards(db, deckId)
      .then((due) => {
        const queue = buildSessionQueue(due)
        setEntries(queue)
        setIndex(0)
        setIsDone(queue.length === 0)
        setSummary(null)
        if (queue.length === 0) {
          setSummary({ totalCards: 0, correct: 0, again: 0, totalTimeMs: 0, xpEarned: 0 })
        }
      })
      .catch((e) => console.error('[useStudySession.reset]', e))
      .finally(() => setIsLoading(false))
  }, [deckId, db])

  const clearPendingEvents = useCallback(() => setPendingEvents([]), [])

  const currentEntry = !isDone && entries.length > 0 ? entries[index] : null
  const progress     = { done: index, total: entries.length }

  return { currentEntry, isLoading, isDone, progress, summary, entries, rate, reset, pendingEvents, clearPendingEvents }
}