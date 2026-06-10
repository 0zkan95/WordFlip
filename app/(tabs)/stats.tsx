/**
 * app/(tabs)/stats.tsx  — Statistics screen
 *
 * Shows:
 *  - Activity heatmap (last 35 days)
 *  - Per-deck retention, review count, avg stability
 *  - Overall totals from user_profile
 */

import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  SafeAreaView, ActivityIndicator,
} from 'react-native'

import { useDatabase }       from '../../src/context/DatabaseContext'
import { getDecks, getDailyActivity, getDeckStats, getProfile } from '../../src/db/queries'
import type { Deck, UserProfile } from '../../src/db/schema'
import type { DeckStats, DailyActivity } from '../../src/db/queries'
import { Colors } from '../../src/theme/colors'

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function Heatmap({ activity }: { activity: DailyActivity[] }) {
  // Build a map of date → count for quick lookup
  const countMap: Record<string, number> = {}
  let maxCount = 1
  for (const a of activity) {
    countMap[a.date] = a.reviewCount
    if (a.reviewCount > maxCount) maxCount = a.reviewCount
  }

  // Generate last 35 days
  const days: string[] = []
  for (let i = 34; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    days.push(d.toISOString().slice(0, 10))
  }

  const cellColor = (date: string) => {
    const count = countMap[date] ?? 0
    if (count === 0)                     return Colors.heatmap.empty
    const ratio = count / maxCount
    if (ratio < 0.33)                    return Colors.heatmap.low
    if (ratio < 0.66)                    return Colors.heatmap.mid
    return Colors.heatmap.high
  }

  return (
    <View style={h.wrap}>
      <Text style={h.title}>Activity — last 5 weeks</Text>
      <View style={h.grid}>
        {days.map((date) => (
          <View key={date} style={[h.cell, { backgroundColor: cellColor(date) }]} />
        ))}
      </View>
      <View style={h.legend}>
        <Text style={h.legendLabel}>Less</Text>
        {[Colors.heatmap.empty, Colors.heatmap.low, Colors.heatmap.mid, Colors.heatmap.high].map((c, i) => (
          <View key={i} style={[h.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={h.legendLabel}>More</Text>
      </View>
    </View>
  )
}

const h = StyleSheet.create({
  wrap:  { marginBottom: 24 },
  title: { fontSize: 12, color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 10 },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell:  { width: 14, height: 14, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  legendLabel: { fontSize: 10, color: Colors.text.faint },
  legendCell:  { width: 10, height: 10, borderRadius: 2 },
})

// ─── Deck stat row ────────────────────────────────────────────────────────────

function DeckStatRow({ deck, stats }: { deck: Deck; stats: DeckStats }) {
  const ret = Math.round(stats.retention * 100)
  const retColor =
    ret >= 90 ? Colors.semantic.success :
    ret >= 70 ? Colors.semantic.warning :
                Colors.semantic.error

  return (
    <View style={d.row}>
      <View style={d.rowLeft}>
        <Text style={{ fontSize: 18, marginRight: 10 }}>{deck.emoji ?? '📚'}</Text>
        <View>
          <Text style={d.deckName}>{deck.name}</Text>
          <Text style={d.deckMeta}>
            {stats.total} cards  ·  avg stability {stats.avgStability.toFixed(1)}d
          </Text>
        </View>
      </View>
      <View style={d.retBadge}>
        <Text style={[d.retText, { color: retColor }]}>{ret}%</Text>
        <Text style={d.retLabel}>retention</Text>
      </View>
    </View>
  )
}

const d = StyleSheet.create({
  row: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  rowLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  deckName: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  deckMeta: { fontSize: 11, color: Colors.text.muted, marginTop: 2 },
  retBadge: { alignItems: 'flex-end' },
  retText:  { fontSize: 18, fontWeight: '500' },
  retLabel: { fontSize: 10, color: Colors.text.faint },
})

// ─── Stats screen ─────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { db } = useDatabase()

  const [profile,  setProfile]  = useState<UserProfile | null>(null)
  const [decks,    setDecks]    = useState<Deck[]>([])
  const [deckStats, setDeckStats] = useState<Record<string, DeckStats>>({})
  const [activity, setActivity] = useState<DailyActivity[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      getProfile(db),
      getDecks(db),
      getDailyActivity(db, 35),
    ]).then(async ([p, d, a]) => {
      setProfile(p)
      setDecks(d)
      setActivity(a)

      // Load per-deck stats in parallel
      const statsMap: Record<string, DeckStats> = {}
      await Promise.all(d.map(async (deck) => {
        statsMap[deck.id] = await getDeckStats(db, deck.id)
      }))
      setDeckStats(statsMap)
    }).finally(() => setLoading(false))
  }, [db])

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  const totalReviews  = profile?.totalReviews     ?? 0
  const totalTimeHrs  = ((profile?.totalStudyTimeMs ?? 0) / 3_600_000).toFixed(1)

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.pageTitle}>Statistics</Text>

        {/* Overall stats */}
        <View style={s.overallRow}>
          <View style={s.overallBox}>
            <Text style={s.overallNum}>{totalReviews.toLocaleString()}</Text>
            <Text style={s.overallLabel}>Total reviews</Text>
          </View>
          <View style={s.overallBox}>
            <Text style={[s.overallNum, { color: Colors.accent.default }]}>
              {(profile?.totalXp ?? 0).toLocaleString()}
            </Text>
            <Text style={s.overallLabel}>Total XP</Text>
          </View>
          <View style={s.overallBox}>
            <Text style={[s.overallNum, { color: Colors.semantic.success }]}>
              {totalTimeHrs}h
            </Text>
            <Text style={s.overallLabel}>Study time</Text>
          </View>
        </View>

        {/* Heatmap */}
        <Heatmap activity={activity} />

        {/* Per-deck breakdown */}
        <Text style={s.sectionLabel}>DECK BREAKDOWN</Text>
        {decks.length === 0 ? (
          <Text style={s.emptyText}>No decks yet. Create one on the Home tab.</Text>
        ) : (
          decks.map((deck) => (
            deckStats[deck.id] ? (
              <DeckStatRow key={deck.id} deck={deck} stats={deckStats[deck.id]} />
            ) : null
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },

  pageTitle: { fontSize: 24, fontWeight: '500', color: Colors.text.primary, marginBottom: 20 },

  overallRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  overallBox: {
    flex: 1, backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, alignItems: 'center',
  },
  overallNum:   { fontSize: 20, fontWeight: '500', color: Colors.text.primary },
  overallLabel: { fontSize: 10, color: Colors.text.muted, marginTop: 4, textAlign: 'center' },

  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.text.muted,
    letterSpacing: 0.06, marginBottom: 10,
  },
  emptyText: { fontSize: 14, color: Colors.text.muted, textAlign: 'center', marginTop: 20 },
})