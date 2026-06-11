/**
 * app/(tabs)/study.tsx  — Study session screen
 *
 * Flow:
 *  1. Pick a deck if no deckId param (deck picker)
 *  2. Load due cards via useStudySession
 *  3. Show FlashCard — user rates each card
 *  4. Session summary when all cards done
 *
 * Navigate here with:
 *   router.push({ pathname: '/(tabs)/study', params: { deckId: 'uuid' } })
 * or just tap the Study tab to see the deck picker.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase }     from '../../src/context/DatabaseContext'
import { useStudySession } from '../../src/hooks/useStudySession'
import FlashCard           from '../../src/components/FlashCard'
import WritingExerciseCard, { WritingResult } from '../../src/components/WritingExerciseCard'
import VoiceRoundCard from '../../src/components/VoiceRoundCard'
import { toBCP47 } from '../../src/utils/languages'
import { getDecks, getDeck, getVoiceNotes, getRemainingNewCards, getPracticeCards, createNotification } from '../../src/db/queries'
import type { StudyCard } from '../../src/db/queries'
import type { Deck, Rating } from '../../src/db/schema'
import { Colors }          from '../../src/theme/colors'
import { sendLocalNotification } from '../../src/notifications/push'

// ─── Deck picker (shown when no deckId param) ─────────────────────────────────

function DeckPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const { db } = useDatabase()
  const [decks, setDecks]   = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDecks(db)
      .then((d) => setDecks(d.filter((dk) => dk.dueCount > 0)))
      .finally(() => setLoading(false))
  }, [db])

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} /></View>
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.pickerHeader}>
        <Text style={s.pickerTitle}>Study</Text>
        <Text style={s.pickerSub}>Choose a deck to review</Text>
      </View>
      <ScrollView contentContainerStyle={s.pickerList}>
        {decks.length === 0 ? (
          <View style={s.allDoneBox}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
            <Text style={s.allDoneTitle}>All caught up!</Text>
            <Text style={s.allDoneSub}>No cards are due right now.{'\n'}Come back later or add new cards.</Text>
          </View>
        ) : (
          decks.map((deck) => (
            <TouchableOpacity
              key={deck.id}
              style={s.pickerRow}
              onPress={() => onSelect(deck.id)}
            >
              <View style={s.pickerIcon}>
                <Text style={{ fontSize: 22 }}>{deck.emoji ?? '📚'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerDeckName}>{deck.name}</Text>
                <Text style={s.pickerDeckMeta}>
                  {(() => {
                    const review = deck.dueCount - deck.newCount
                    const parts: string[] = []
                    if (review > 0) parts.push(`${review} review`)
                    if (deck.newCount > 0) parts.push(`${deck.newCount} new`)
                    return parts.join(' · ') || `${deck.dueCount} due`
                  })()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.muted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Session summary ──────────────────────────────────────────────────────────

function SessionSummary({
  summary, deckId, remainingNewCards, onDone, onStudyMore, onPracticeAgain,
}: {
  summary: { totalCards: number; correct: number; again: number; xpEarned: number; totalTimeMs: number }
  deckId: string
  remainingNewCards: number
  onDone: () => void
  onStudyMore: () => void
  onPracticeAgain: () => void
}) {
  const retention = summary.totalCards > 0
    ? Math.round((summary.correct / summary.totalCards) * 100)
    : 0

  const mins = Math.floor(summary.totalTimeMs / 60_000)
  const secs = Math.floor((summary.totalTimeMs % 60_000) / 1_000)

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.summaryScroll} showsVerticalScrollIndicator={false}>
        <View style={s.summaryWrap}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>
            {retention >= 90 ? '🏆' : retention >= 70 ? '👍' : '💪'}
          </Text>
          <Text style={s.summaryTitle}>Session complete</Text>
          <Text style={s.summaryTime}>{mins}m {secs}s</Text>

          {/* Stats grid */}
          <View style={s.statsGrid}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{summary.totalCards}</Text>
              <Text style={s.statLabel}>Cards reviewed</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: Colors.semantic.success }]}>{retention}%</Text>
              <Text style={s.statLabel}>Retention</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: Colors.accent.default }]}>+{summary.xpEarned}</Text>
              <Text style={s.statLabel}>XP earned</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: Colors.semantic.error }]}>{summary.again}</Text>
              <Text style={s.statLabel}>Again</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={s.actionButtonsWrap}>
            {remainingNewCards > 0 && (
              <TouchableOpacity style={s.actionBtn} onPress={onStudyMore}>
                <Ionicons name="add-circle-outline" size={20} color={Colors.accent.default} />
                <Text style={s.actionBtnText}>Study {remainingNewCards} more new</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.actionBtn} onPress={onPracticeAgain}>
              <Ionicons name="repeat-outline" size={20} color={Colors.text.secondary} />
              <Text style={s.actionBtnText}>Practice again</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.doneBtn} onPress={onDone}>
            <Text style={s.doneBtnText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Writing round summary ────────────────────────────────────────────────────

function WritingRoundSummary({
  scores, total, onNext,
}: {
  scores: { correct: number; close: number; wrong: number }
  total: number
  onNext: () => void
}) {
  const accuracy = total > 0 ? Math.round(((scores.correct + scores.close) / total) * 100) : 0
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, alignItems: 'center' }}>
        <View style={wr.summaryEmoji}>
          <Text style={{ fontSize: 48 }}>{accuracy >= 80 ? '🏆' : accuracy >= 50 ? '✍️' : '📖'}</Text>
        </View>
        <Text style={wr.summaryTitle}>Writing round done!</Text>
        <Text style={wr.summaryAcc}>{accuracy}% accuracy</Text>

        <View style={wr.scoreRow}>
          <View style={[wr.scoreBox, { borderColor: '#4ade8040', backgroundColor: 'rgba(74,222,128,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#4ade80' }]}>{scores.correct}</Text>
            <Text style={wr.scoreLabel}>Correct</Text>
          </View>
          <View style={[wr.scoreBox, { borderColor: '#facc1540', backgroundColor: 'rgba(250,204,21,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#facc15' }]}>{scores.close}</Text>
            <Text style={wr.scoreLabel}>Close</Text>
          </View>
          <View style={[wr.scoreBox, { borderColor: '#f8717140', backgroundColor: 'rgba(248,113,113,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#f87171' }]}>{scores.wrong}</Text>
            <Text style={wr.scoreLabel}>Wrong</Text>
          </View>
        </View>

        <TouchableOpacity style={wr.continueBtn} onPress={onNext} activeOpacity={0.8}>
          <Text style={wr.continueBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Writing round view ───────────────────────────────────────────────────────

function WritingRoundView({
  cards, onComplete,
}: {
  cards: StudyCard[]
  onComplete: () => void
}) {
  const [index,       setIndex]       = useState(0)
  const [scores,      setScores]      = useState({ correct: 0, close: 0, wrong: 0 })
  const [showSummary, setShowSummary] = useState(false)

  if (cards.length === 0) { onComplete(); return null }

  if (showSummary) {
    return <WritingRoundSummary scores={scores} total={cards.length} onNext={onComplete} />
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <WritingExerciseCard
        card={cards[index]}
        current={index + 1}
        total={cards.length}
        onNext={(result: WritingResult) => {
          const next = { ...scores, [result]: scores[result] + 1 }
          setScores(next)
          if (index + 1 >= cards.length) setShowSummary(true)
          else setIndex(index + 1)
        }}
        onSkip={onComplete}
      />
    </SafeAreaView>
  )
}

const wr = StyleSheet.create({
  summaryEmoji: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  summaryTitle: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, marginBottom: 6 },
  summaryAcc:   { fontSize: 15, color: Colors.text.muted, marginBottom: 32 },
  scoreRow: { flexDirection: 'row', gap: 12, marginBottom: 40 },
  scoreBox: {
    flex: 1, borderRadius: 16, borderWidth: 0.5, padding: 16, alignItems: 'center',
  },
  scoreNum:   { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  scoreLabel: { fontSize: 12, fontWeight: '500', color: Colors.text.muted },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent.default, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 32,
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})

// ─── Voice round view ─────────────────────────────────────────────────────────

function VoiceRoundSummary({
  scores, total, onNext,
}: {
  scores: { correct: number; close: number; wrong: number }
  total: number
  onNext: () => void
}) {
  const accuracy = total > 0 ? Math.round(((scores.correct + scores.close) / total) * 100) : 0
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, alignItems: 'center' }}>
        <View style={wr.summaryEmoji}>
          <Text style={{ fontSize: 48 }}>{accuracy >= 80 ? '🎙️' : accuracy >= 50 ? '🗣️' : '📖'}</Text>
        </View>
        <Text style={wr.summaryTitle}>Voice round done!</Text>
        <Text style={wr.summaryAcc}>{accuracy}% accuracy</Text>
        <View style={wr.scoreRow}>
          <View style={[wr.scoreBox, { borderColor: '#4ade8040', backgroundColor: 'rgba(74,222,128,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#4ade80' }]}>{scores.correct}</Text>
            <Text style={wr.scoreLabel}>Correct</Text>
          </View>
          <View style={[wr.scoreBox, { borderColor: '#facc1540', backgroundColor: 'rgba(250,204,21,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#facc15' }]}>{scores.close}</Text>
            <Text style={wr.scoreLabel}>Close</Text>
          </View>
          <View style={[wr.scoreBox, { borderColor: '#f8717140', backgroundColor: 'rgba(248,113,113,0.08)' }]}>
            <Text style={[wr.scoreNum, { color: '#f87171' }]}>{scores.wrong}</Text>
            <Text style={wr.scoreLabel}>Wrong</Text>
          </View>
        </View>
        <TouchableOpacity style={wr.continueBtn} onPress={onNext} activeOpacity={0.8}>
          <Text style={wr.continueBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function VoiceRoundView({
  cards, lang, onComplete,
}: {
  cards:      StudyCard[]
  lang:       string
  onComplete: () => void
}) {
  const [index,       setIndex]       = useState(0)
  const [scores,      setScores]      = useState({ correct: 0, close: 0, wrong: 0 })
  const [showSummary, setShowSummary] = useState(false)

  if (cards.length === 0) { onComplete(); return null }

  if (showSummary) {
    return <VoiceRoundSummary scores={scores} total={cards.length} onNext={onComplete} />
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <VoiceRoundCard
        card={cards[index]}
        lang={lang}
        current={index + 1}
        total={cards.length}
        onNext={(result) => {
          const next = { ...scores, [result]: scores[result] + 1 }
          setScores(next)
          if (index + 1 >= cards.length) setShowSummary(true)
          else setIndex(index + 1)
        }}
        onSkip={onComplete}
      />
    </SafeAreaView>
  )
}

// ─── Session view — progress bar + FlashCard ─────────────────────────────────

function SessionView({
  deckId, onExit,
}: {
  deckId: string; onExit: () => void
}) {
  const { db } = useDatabase()
  const { currentEntry, isLoading, isDone, progress, summary, entries, rate, reset, pendingEvents, clearPendingEvents } =
    useStudySession(deckId, db)

  const [remainingNewCards, setRemainingNewCards] = useState(0)

  // Handle milestone events → push notification + in-app notification record
  useEffect(() => {
    if (pendingEvents.length === 0) return

    const handle = async () => {
      for (const ev of pendingEvents) {
        if (ev.leveledUp) {
          const title = `Level ${ev.newLevel}! 🏆`
          const body  = `You reached level ${ev.newLevel} in WordFlip. Keep it up!`
          await sendLocalNotification(title, body)
          await createNotification(db, { type: 'level_up', title, body })
        }
        if (ev.streakMilestone != null) {
          const title = `${ev.streakMilestone}-day streak! 🔥`
          const body  = `Amazing — you've studied ${ev.streakMilestone} days in a row.`
          await sendLocalNotification(title, body)
          await createNotification(db, { type: 'streak_milestone', title, body })
        }
        if (ev.xpMilestone != null) {
          const title = `${ev.xpMilestone.toLocaleString()} XP milestone! ⭐`
          const body  = `You've earned ${ev.xpMilestone.toLocaleString()} XP in WordFlip. Impressive!`
          await sendLocalNotification(title, body)
          await createNotification(db, { type: 'xp_milestone', title, body })
        }
      }
      clearPendingEvents()
    }

    handle().catch((e) => console.warn('[SessionView] handleEvents:', e))
  }, [pendingEvents])

  // Round state: study → writing? → voice? → summary
  type ViewMode = 'study' | 'writing' | 'voice' | 'summary'
  const [viewMode, setViewMode] = useState<ViewMode>('study')

  // Load deck settings
  const [targetLanguage,     setTargetLanguage]     = useState<string | undefined>(undefined)
  const [writingExercisesOn, setWritingExercisesOn] = useState(false)
  const [voiceExercisesOn,   setVoiceExercisesOn]   = useState(false)
  useEffect(() => {
    getDeck(db, deckId).then(d => {
      if (d) {
        setTargetLanguage(d.targetLanguage)
        setWritingExercisesOn(d.writingExercises)
        setVoiceExercisesOn(d.voiceExercises)
      }
    })
  }, [db, deckId])

  // Load remaining new cards when session is done
  useEffect(() => {
    if (isDone) {
      getRemainingNewCards(db, deckId).then(cards => setRemainingNewCards(cards.length))
    }
  }, [isDone, db, deckId])

  // Helpers to advance through optional rounds
  const afterWriting = useCallback(() =>
    setViewMode(voiceExercisesOn ? 'voice' : 'summary'), [voiceExercisesOn])
  const afterVoice   = useCallback(() => setViewMode('summary'), [])

  // When study session ends, move to first enabled round (or summary)
  useEffect(() => {
    if (isDone && summary && viewMode === 'study') {
      if (writingExercisesOn)    setViewMode('writing')
      else if (voiceExercisesOn) setViewMode('voice')
      else                       setViewMode('summary')
    }
  }, [isDone, summary, viewMode, writingExercisesOn, voiceExercisesOn])

  // Load voice note URI for current card — only if one was recorded
  const [voiceUri, setVoiceUri] = useState<string | null>(null)
  useEffect(() => {
    if (!currentEntry) { setVoiceUri(null); return }
    const cardId = currentEntry.reversed
      ? currentEntry.card.id
      : currentEntry.card.id
    getVoiceNotes(db, cardId).then(notes => {
      setVoiceUri(notes.length > 0 ? notes[0].fileUri : null)
    })
  }, [db, currentEntry?.card.id])

  const handleRate = useCallback((rating: Rating) => {
    rate(rating)
  }, [rate])

  const handleStudyMore = useCallback(() => {
    reset()
    setViewMode('study')
  }, [reset])

  const handlePracticeAgain = useCallback(() => {
    reset()
    setViewMode('study')
  }, [reset])

  const handleWritingRoundEnd = afterWriting
  const handleVoiceRoundEnd  = afterVoice

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  // Deduplicate session entries to unique base cards (used by writing + voice rounds)
  const uniqueCards: StudyCard[] = []
  if (isDone) {
    const seen = new Set<string>()
    for (const e of entries) {
      if (!seen.has(e.card.id)) { seen.add(e.card.id); uniqueCards.push(e.card) }
    }
  }

  // Writing round view
  if (isDone && viewMode === 'writing' && summary) {
    return <WritingRoundView cards={uniqueCards} onComplete={handleWritingRoundEnd} />
  }

  // Voice round view
  if (isDone && viewMode === 'voice' && summary) {
    return (
      <VoiceRoundView
        cards={uniqueCards}
        lang={toBCP47(targetLanguage ?? 'en')}
        onComplete={handleVoiceRoundEnd}
      />
    )
  }

  // Session summary view
  if (isDone && summary) {
    return (
      <SessionSummary
        summary={summary}
        deckId={deckId}
        remainingNewCards={remainingNewCards}
        onDone={onExit}
        onStudyMore={handleStudyMore}
        onPracticeAgain={handlePracticeAgain}
      />
    )
  }

  // Study session view
  if (!currentEntry) return null

  const progressPct = progress.total > 0 ? progress.done / progress.total : 0

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.sessionHeader}>
        <View>
          <Text style={s.sessionDeck}>Study session</Text>
        </View>
        <View style={s.sessionHeaderRight}>
          <Text style={s.sessionCount}>{progress.done} / {progress.total}</Text>
          <TouchableOpacity style={s.exitBtn} onPress={onExit}>
            <Ionicons name="close" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progressPct * 100}%` }]} />
      </View>

      <FlashCard card={currentEntry.card} reversed={currentEntry.reversed} targetLanguage={targetLanguage} voiceUri={voiceUri} onRate={handleRate} />
    </SafeAreaView>
  )
}

// ─── Practice view (writing-only or voice-only, no flashcard round) ───────────

function PracticeView({
  deckId, mode, onExit,
}: {
  deckId: string
  mode: 'writing' | 'voice'
  onExit: () => void
}) {
  const { db } = useDatabase()
  const [cards,   setCards]   = useState<StudyCard[]>([])
  const [loading, setLoading] = useState(true)
  const [lang,    setLang]    = useState('en-US')

  useEffect(() => {
    Promise.all([
      getPracticeCards(db, deckId),
      getDeck(db, deckId),
    ]).then(([c, d]) => {
      setCards(c)
      if (d) setLang(toBCP47(d.targetLanguage))
    }).finally(() => setLoading(false))
  }, [db, deckId])

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <View style={s.center}>
          <Ionicons name="book-outline" size={48} color={Colors.text.faint} style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 17, fontWeight: '500', color: Colors.text.primary, marginBottom: 8 }}>
            No cards to practise yet
          </Text>
          <Text style={{ fontSize: 14, color: Colors.text.muted, textAlign: 'center', paddingHorizontal: 32 }}>
            Study some flashcards first so words unlock for writing and voice practice.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 28, backgroundColor: Colors.accent.default, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}
            onPress={onExit}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (mode === 'writing') {
    return <WritingRoundView cards={cards} onComplete={onExit} />
  }

  return <VoiceRoundView cards={cards} lang={lang} onComplete={onExit} />
}

// ─── Study tab root ───────────────────────────────────────────────────────────

export default function StudyScreen() {
  const params = useLocalSearchParams<{ deckId?: string; mode?: string }>()
  const router = useRouter()

  const [activeDeckId, setActiveDeckId] = useState<string | null>(params.deckId ?? null)
  const practiceMode = (params.mode === 'writing' || params.mode === 'voice') ? params.mode : null

  useEffect(() => {
    if (params.deckId) setActiveDeckId(params.deckId)
  }, [params.deckId])

  const handleExit = useCallback(() => {
    setActiveDeckId(null)
    router.back()
  }, [router])

  if (!activeDeckId) {
    return <DeckPicker onSelect={(id) => setActiveDeckId(id)} />
  }

  if (practiceMode) {
    return <PracticeView deckId={activeDeckId} mode={practiceMode} onExit={handleExit} />
  }

  return <SessionView deckId={activeDeckId} onExit={handleExit} />
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },

  // Deck picker
  pickerHeader: { padding: 20, paddingBottom: 12 },
  pickerTitle:  { fontSize: 24, fontWeight: '500', color: Colors.text.primary },
  pickerSub:    { fontSize: 14, color: Colors.text.muted, marginTop: 4 },
  pickerList:   { padding: 16, paddingTop: 8 },
  pickerRow: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, flexDirection: 'row', alignItems: 'center',
    marginBottom: 10,
  },
  pickerIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  pickerDeckName: { fontSize: 15, fontWeight: '500', color: Colors.text.primary },
  pickerDeckMeta: { fontSize: 12, color: Colors.accent.default, marginTop: 3 },

  allDoneBox: { alignItems: 'center', paddingTop: 80 },
  allDoneTitle: { fontSize: 20, fontWeight: '500', color: Colors.text.primary, marginBottom: 8 },
  allDoneSub:   { fontSize: 14, color: Colors.text.muted, textAlign: 'center', lineHeight: 22 },

  // Session header
  sessionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
  },
  sessionDeck: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  sessionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCount: { fontSize: 12, color: Colors.text.muted },
  exitBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },

  // Progress bar
  progressTrack: {
    height: 3, backgroundColor: Colors.xp.barTrack,
    marginHorizontal: 16, marginBottom: 12, borderRadius: 2,
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.accent.default, borderRadius: 2,
  },

  // Summary
  summaryScroll: { flexGrow: 1, justifyContent: 'center' },
  summaryWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  summaryTitle: { fontSize: 22, fontWeight: '500', color: Colors.text.primary, marginBottom: 4 },
  summaryTime:  { fontSize: 14, color: Colors.text.muted, marginBottom: 32 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    justifyContent: 'center', marginBottom: 40, width: '100%',
  },
  statBox: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, alignItems: 'center', width: '44%',
  },
  statNum:   { fontSize: 26, fontWeight: '500', color: Colors.text.primary },
  statLabel: { fontSize: 12, color: Colors.text.muted, marginTop: 4 },

  // Action buttons
  actionButtonsWrap: { gap: 10, marginBottom: 20, width: '100%' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.bg.surface,
    borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border.default,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  actionBtnText: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },

  doneBtn: {
    backgroundColor: Colors.accent.default,
    borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14,
  },
  doneBtnText: { fontSize: 15, fontWeight: '500', color: '#fff' },
})