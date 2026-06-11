import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Animated, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase } from '../../src/context/DatabaseContext'
import {
  getProfile, getXpByRating, getXpByDeck, getDailyXpActivity,
  getTodayXp, getWeeklyXpComparison,
} from '../../src/db/queries'
import type { UserProfile } from '../../src/db/schema'
import type { XpByRating, DeckXpStats, DailyXpActivity, WeeklyXpComparison } from '../../src/db/queries'
import { xpForLevel, XP_PER_RATING, streakMultiplier, STREAK_DAILY_MINIMUM } from '../../src/db/schema'
import { Colors } from '../../src/theme/colors'

const { height: SCREEN_H } = Dimensions.get('window')

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

function InfoSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_H,
      useNativeDriver: true, tension: 65, friction: 11,
    }).start()
  }, [visible])
  if (!visible) return null
  return (
    <Modal transparent animationType="none" onRequestClose={onClose} visible={visible}>
      <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[sh.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={sh.handle} />
        <View style={sh.header}>
          <Text style={sh.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={sh.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
        {children}
      </Animated.View>
    </Modal>
  )
}
const sh = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingBottom: 40, maxHeight: SCREEN_H * 0.65 },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle, marginBottom: 16 },
  title:    { fontSize: 16, fontWeight: '500', color: Colors.text.primary },
  closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.bg.surface, alignItems: 'center', justifyContent: 'center' },
})

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ icon, value, label, sub }: {
  icon: string; value: string; label: string; sub?: string
}) {
  return (
    <View style={t.tile}>
      <Text style={t.icon}>{icon}</Text>
      <Text style={t.value}>{value}</Text>
      <Text style={t.label}>{label}</Text>
      {sub && <Text style={t.sub}>{sub}</Text>}
    </View>
  )
}
const t = StyleSheet.create({
  tile:  { flex: 1, backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, alignItems: 'center', gap: 4 },
  icon:  { fontSize: 26, marginBottom: 2 },
  value: { fontSize: 28, fontWeight: '500', color: Colors.text.primary },
  label: { fontSize: 12, color: Colors.text.muted, textAlign: 'center' },
  sub:   { fontSize: 10, color: Colors.text.faint, textAlign: 'center' },
})

// ─── Today's XP card ──────────────────────────────────────────────────────────

function TodayXpCard({ todayXp, reviewCount, multiplier }: {
  todayXp: number; reviewCount: number; multiplier: number
}) {
  const hasActivity = reviewCount > 0
  return (
    <View style={tx.wrap}>
      <View style={tx.left}>
        <Text style={tx.label}>Today</Text>
        <Text style={tx.xp}>{todayXp.toLocaleString()} XP</Text>
        <Text style={tx.reviews}>
          {hasActivity ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'No reviews yet today'}
        </Text>
      </View>
      <View style={[tx.multiplierBadge, multiplier > 1 && tx.multiplierBadgeActive]}>
        <Text style={[tx.multiplierIcon, multiplier > 1 && tx.multiplierIconActive]}>⚡</Text>
        <Text style={[tx.multiplierText, multiplier > 1 && tx.multiplierTextActive]}>
          {multiplier}× XP
        </Text>
      </View>
    </View>
  )
}
const tx = StyleSheet.create({
  wrap:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 12 },
  left:                { flex: 1 },
  label:               { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 4 },
  xp:                  { fontSize: 24, fontWeight: '500', color: Colors.text.primary },
  reviews:             { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  multiplierBadge:     { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg.elevated, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 0.5, borderColor: Colors.border.default, gap: 2 },
  multiplierBadgeActive: { backgroundColor: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.3)' },
  multiplierIcon:      { fontSize: 18 },
  multiplierIconActive:{},
  multiplierText:      { fontSize: 13, fontWeight: '600', color: Colors.text.muted },
  multiplierTextActive:{ color: Colors.accent.default },
})

// ─── Multiplier status card ───────────────────────────────────────────────────

function MultiplierCard({ profile }: { profile: UserProfile }) {
  const streak     = profile.currentStreak
  const multiplier = streakMultiplier(streak)

  const nextMilestone = streak < 7 ? 7 : streak < 30 ? 30 : null
  const daysToNext    = nextMilestone ? nextMilestone - streak : 0
  const progressPct   = nextMilestone
    ? (streak < 7 ? streak / 7 : (streak - 7) / 23) * 100
    : 100

  const multiplierColor = multiplier >= 3 ? '#fbbf24' : multiplier >= 2 ? Colors.accent.default : Colors.text.muted
  const multiplierBg    = multiplier >= 3 ? 'rgba(251,191,36,0.12)' : multiplier >= 2 ? Colors.accent.dim : Colors.bg.elevated

  return (
    <View style={mc.wrap}>
      <View style={mc.header}>
        <View>
          <Text style={mc.label}>XP MULTIPLIER</Text>
          <Text style={mc.value}>{multiplier}× per review</Text>
        </View>
        <View style={[mc.badge, { backgroundColor: multiplierBg }]}>
          <Text style={[mc.badgeText, { color: multiplierColor }]}>{multiplier}×</Text>
        </View>
      </View>

      {nextMilestone ? (
        <>
          <View style={mc.progressRow}>
            <Text style={mc.progressLabel}>
              {streak < 7 ? '1× now' : '2× now'}
            </Text>
            <Text style={mc.progressLabel}>
              {nextMilestone}d → {streakMultiplier(nextMilestone)}×
            </Text>
          </View>
          <View style={mc.track}>
            <View style={[mc.fill, { width: `${Math.min(progressPct, 100)}%` as any }]} />
          </View>
          <Text style={mc.hint}>
            {daysToNext} more day{daysToNext !== 1 ? 's' : ''} to unlock {streakMultiplier(nextMilestone)}× multiplier
          </Text>
        </>
      ) : (
        <Text style={mc.hint}>🏆 Maximum 3× multiplier active — keep it going!</Text>
      )}
    </View>
  )
}
const mc = StyleSheet.create({
  wrap:         { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 12 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  label:        { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 4 },
  value:        { fontSize: 18, fontWeight: '500', color: Colors.text.primary },
  badge:        { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontSize: 20, fontWeight: '700' },
  progressRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel:{ fontSize: 11, color: Colors.text.muted },
  track:        { height: 6, backgroundColor: Colors.xp.barTrack, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  fill:         { height: '100%', backgroundColor: Colors.accent.default, borderRadius: 3 },
  hint:         { fontSize: 12, color: Colors.text.muted },
})

// ─── Weekly trend card ────────────────────────────────────────────────────────

function WeeklyTrendCard({ comparison }: { comparison: WeeklyXpComparison }) {
  const diff = comparison.thisWeek - comparison.lastWeek
  const pct  = comparison.lastWeek > 0 ? Math.round((diff / comparison.lastWeek) * 100) : null
  const isUp = diff >= 0

  return (
    <View style={wt.wrap}>
      <Text style={wt.sectionLabel}>WEEKLY TREND</Text>
      <View style={wt.row}>
        <View style={wt.col}>
          <Text style={wt.colLabel}>This week</Text>
          <Text style={wt.colValue}>{comparison.thisWeek.toLocaleString()}</Text>
          <Text style={wt.colUnit}>base XP</Text>
        </View>
        <View style={wt.divider} />
        <View style={wt.col}>
          <Text style={wt.colLabel}>Last week</Text>
          <Text style={wt.colValue}>{comparison.lastWeek.toLocaleString()}</Text>
          <Text style={wt.colUnit}>base XP</Text>
        </View>
        {pct !== null && (
          <View style={[wt.badge, { backgroundColor: isUp ? Colors.semantic.successDim : Colors.semantic.errorDim }]}>
            <Text style={[wt.badgeText, { color: isUp ? Colors.semantic.success : Colors.semantic.error }]}>
              {isUp ? '+' : ''}{pct}%
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}
const wt = StyleSheet.create({
  wrap:         { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 14 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 16 },
  col:          { flex: 1 },
  colLabel:     { fontSize: 11, color: Colors.text.muted, marginBottom: 4 },
  colValue:     { fontSize: 22, fontWeight: '500', color: Colors.text.primary },
  colUnit:      { fontSize: 11, color: Colors.text.faint, marginTop: 2 },
  divider:      { width: 0.5, height: 48, backgroundColor: Colors.border.default },
  badge:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontSize: 14, fontWeight: '700' },
})

// ─── Rating breakdown row ──────────────────────────────────────────────────────

function RatingRow({ rating }: { rating: XpByRating }) {
  const ratingColors: Record<string, { bg: string; border: string; text: string }> = {
    Again: { bg: 'rgba(239,68,68,0.1)',   border: '#ef4444', text: '#dc2626' },
    Hard:  { bg: 'rgba(251,146,60,0.1)',  border: '#fb923c', text: '#ea580c' },
    Good:  { bg: 'rgba(34,197,94,0.1)',   border: '#22c55e', text: '#15803d' },
    Easy:  { bg: 'rgba(34,197,94,0.1)',   border: '#22c55e', text: '#15803d' },
  }
  const c = ratingColors[rating.label] ?? ratingColors.Good
  return (
    <View style={r.row}>
      <View style={[r.ratingBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[r.ratingLabel, { color: c.text }]}>{rating.label}</Text>
      </View>
      <View style={r.rowContent}>
        <Text style={r.count}>{rating.count} review{rating.count !== 1 ? 's' : ''}</Text>
        <Text style={r.xp}>{rating.xp.toLocaleString()} XP</Text>
      </View>
    </View>
  )
}
const r = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.bg.surface, borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: Colors.border.default },
  ratingBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  ratingLabel: { fontSize: 12, fontWeight: '600' },
  rowContent:  { flex: 1 },
  count:       { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  xp:          { fontSize: 12, color: Colors.accent.default, marginTop: 2 },
})

// ─── Deck XP row ──────────────────────────────────────────────────────────────

function DeckXpRow({ deck }: { deck: DeckXpStats }) {
  return (
    <View style={d.row}>
      <View style={d.deckIcon}><Text style={{ fontSize: 20 }}>{deck.emoji ?? '📚'}</Text></View>
      <View style={d.deckContent}>
        <Text style={d.deckName}>{deck.deckName}</Text>
        <Text style={d.reviewCount}>{deck.reviews} review{deck.reviews !== 1 ? 's' : ''}</Text>
      </View>
      <Text style={d.xpText}>{deck.xp.toLocaleString()}</Text>
    </View>
  )
}
const d = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.bg.surface, borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: Colors.border.default },
  deckIcon:    { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.accent.dim, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  deckContent: { flex: 1 },
  deckName:    { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  reviewCount: { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  xpText:      { fontSize: 16, fontWeight: '600', color: Colors.accent.default },
})

// ─── XP heatmap ───────────────────────────────────────────────────────────────

function XpHeatmap({ activity }: { activity: DailyXpActivity[] }) {
  const countMap: Record<string, number> = {}
  let maxXp = 1
  for (const a of activity) { countMap[a.date] = a.xp; if (a.xp > maxXp) maxXp = a.xp }

  const days: string[] = []
  for (let i = 34; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86_400_000)
    days.push(dt.toISOString().slice(0, 10))
  }
  const cellColor = (date: string) => {
    const xp = countMap[date] ?? 0
    if (xp === 0) return Colors.heatmap.empty
    const ratio = xp / maxXp
    if (ratio < 0.33) return Colors.heatmap.low
    if (ratio < 0.66) return Colors.heatmap.mid
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
  wrap:        { marginBottom: 24 },
  title:       { fontSize: 12, color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 10 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell:        { width: 14, height: 14, borderRadius: 3 },
  legend:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  legendLabel: { fontSize: 10, color: Colors.text.faint },
  legendCell:  { width: 10, height: 10, borderRadius: 2 },
})

// ─── Milestones ───────────────────────────────────────────────────────────────

const MILESTONES = [
  { id: 'm1',  icon: '🎯', label: 'First 10',     desc: '10 reviews',      check: (p: UserProfile) => p.totalReviews >= 10 },
  { id: 'm2',  icon: '💯', label: 'Century',       desc: '100 reviews',     check: (p: UserProfile) => p.totalReviews >= 100 },
  { id: 'm3',  icon: '🔥', label: 'Dedicated',     desc: '500 reviews',     check: (p: UserProfile) => p.totalReviews >= 500 },
  { id: 'm4',  icon: '⚡', label: 'Expert',         desc: '1,000 reviews',   check: (p: UserProfile) => p.totalReviews >= 1000 },
  { id: 'm5',  icon: '🌟', label: 'Week Streak',   desc: '7-day streak',    check: (p: UserProfile) => p.longestStreak >= 7 },
  { id: 'm6',  icon: '🏆', label: 'Month Streak',  desc: '30-day streak',   check: (p: UserProfile) => p.longestStreak >= 30 },
  { id: 'm7',  icon: '👑', label: 'Centurion',     desc: '100-day streak',  check: (p: UserProfile) => p.longestStreak >= 100 },
  { id: 'm8',  icon: '⭐', label: '500 XP',        desc: 'Earn 500 XP',     check: (p: UserProfile) => p.totalXp >= 500 },
  { id: 'm9',  icon: '🌠', label: '5,000 XP',      desc: 'Earn 5,000 XP',  check: (p: UserProfile) => p.totalXp >= 5000 },
  { id: 'm10', icon: '📈', label: 'Level 5',       desc: 'Reach level 5',   check: (p: UserProfile) => p.level >= 5 },
  { id: 'm11', icon: '🎖', label: 'Level 10',      desc: 'Reach level 10',  check: (p: UserProfile) => p.level >= 10 },
  { id: 'm12', icon: '🎓', label: 'Level 20',      desc: 'Reach level 20',  check: (p: UserProfile) => p.level >= 20 },
]

function MilestonesSection({ profile }: { profile: UserProfile }) {
  const unlocked = MILESTONES.filter(m => m.check(profile)).length
  return (
    <View style={ms.wrap}>
      <View style={ms.headerRow}>
        <Text style={ms.sectionLabel}>ACHIEVEMENTS</Text>
        <Text style={ms.count}>{unlocked} / {MILESTONES.length}</Text>
      </View>
      <View style={ms.grid}>
        {MILESTONES.map((m) => {
          const done = m.check(profile)
          return (
            <View key={m.id} style={[ms.badge, done && ms.badgeDone]}>
              <Text style={[ms.badgeIcon, !done && ms.badgeIconLocked]}>{m.icon}</Text>
              <Text style={[ms.badgeLabel, !done && ms.badgeLabelLocked]} numberOfLines={1}>{m.label}</Text>
              <Text style={[ms.badgeDesc, !done && ms.badgeDescLocked]} numberOfLines={1}>{m.desc}</Text>
              {done && <View style={ms.check}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
            </View>
          )
        })}
      </View>
    </View>
  )
}
const ms = StyleSheet.create({
  wrap:            { marginBottom: 16 },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel:    { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06 },
  count:           { fontSize: 12, color: Colors.accent.default, fontWeight: '500' },
  grid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:           { width: '31%', backgroundColor: Colors.bg.surface, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default, padding: 12, alignItems: 'center', gap: 4, position: 'relative' },
  badgeDone:       { borderColor: 'rgba(167,139,250,0.3)', backgroundColor: Colors.accent.glow },
  badgeIcon:       { fontSize: 24 },
  badgeIconLocked: { opacity: 0.3 },
  badgeLabel:      { fontSize: 11, fontWeight: '600', color: Colors.text.primary, textAlign: 'center' },
  badgeLabelLocked:{ color: Colors.text.faint },
  badgeDesc:       { fontSize: 10, color: Colors.text.muted, textAlign: 'center' },
  badgeDescLocked: { color: Colors.text.faint },
  check:           { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.accent.default, alignItems: 'center', justifyContent: 'center' },
})

// ─── Info button ──────────────────────────────────────────────────────────────

function InfoBtn({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons name="information-circle-outline" size={18} color={Colors.accent.default} />
    </TouchableOpacity>
  )
}

// ─── Popup row ────────────────────────────────────────────────────────────────

function PRow({ emoji, heading, body, last }: {
  emoji: string; heading: string; body: string; last?: boolean
}) {
  return (
    <View style={[p.row, last && { marginBottom: 0 }]}>
      <Text style={p.emoji}>{emoji}</Text>
      <View style={p.textWrap}>
        <Text style={p.heading}>{heading}</Text>
        <Text style={p.body}>{body}</Text>
      </View>
    </View>
  )
}
const p = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 14, marginBottom: 20, alignItems: 'flex-start' },
  emoji:   { fontSize: 24, marginTop: 2 },
  textWrap:{ flex: 1 },
  heading: { fontSize: 14, fontWeight: '600', color: Colors.text.primary, marginBottom: 5 },
  body:    { fontSize: 13, color: Colors.text.secondary, lineHeight: 20 },
})

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function XpScreen() {
  const { db } = useDatabase()
  const router = useRouter()

  const [profile,         setProfile]         = useState<UserProfile | null>(null)
  const [xpByRating,      setXpByRating]      = useState<XpByRating[]>([])
  const [xpByDeck,        setXpByDeck]        = useState<DeckXpStats[]>([])
  const [dailyXp,         setDailyXp]         = useState<DailyXpActivity[]>([])
  const [todayXp,         setTodayXp]         = useState(0)
  const [weeklyComparison,setWeeklyComparison]= useState<WeeklyXpComparison>({ thisWeek: 0, lastWeek: 0 })
  const [loading,         setLoading]         = useState(true)

  const [showHowCalc,   setShowHowCalc]   = useState(false)
  const [showWhyImport, setShowWhyImport] = useState(false)

  const load = useCallback(async () => {
    const [prof, xpRating, xpDecks, dailyActivity, todayXpVal, weekly] = await Promise.all([
      getProfile(db),
      getXpByRating(db),
      getXpByDeck(db),
      getDailyXpActivity(db, 35),
      getTodayXp(db),
      getWeeklyXpComparison(db),
    ])
    setProfile(prof)
    setXpByRating(xpRating)
    setXpByDeck(xpDecks)
    setDailyXp(dailyActivity)
    setTodayXp(todayXpVal)
    setWeeklyComparison(weekly)
  }, [db])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  if (loading || !profile) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  const nextLevelXp  = xpForLevel(profile.level + 1)
  const progressPct  = profile.xpToNextLevel > 0 ? (nextLevelXp - profile.xpToNextLevel) / nextLevelXp : 1
  const xpLabel      = profile.totalXp >= 1000 ? `${(profile.totalXp / 1000).toFixed(1)}k` : String(profile.totalXp)

  const todayStr     = new Date().toISOString().slice(0, 10)
  const todayCount   = profile.lastStudyDate === todayStr ? profile.dailyReviewsCount : 0
  const multiplier   = todayCount >= STREAK_DAILY_MINIMUM ? streakMultiplier(profile.currentStreak) : 1

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>XP & Level</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── XP + Level tiles ───────────────────────────────────────── */}
        <View style={s.tilesRow}>
          <StatTile icon="⭐" value={xpLabel}             label="Total XP" />
          <StatTile icon="📈" value={String(profile.level)} label="Level"    sub={`${profile.xpToNextLevel.toLocaleString()} to next`} />
        </View>

        {/* ── Today's XP ────────────────────────────────────────────── */}
        <TodayXpCard todayXp={todayXp} reviewCount={todayCount} multiplier={multiplier} />

        {/* ── Multiplier status ─────────────────────────────────────── */}
        <MultiplierCard profile={profile} />

        {/* ── Level progress bar ────────────────────────────────────── */}
        <View style={s.levelCard}>
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={s.levelLabel}>Level {profile.level} → {profile.level + 1}</Text>
              <Text style={s.levelProgress}>{Math.round(progressPct * 100)}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progressPct * 100}%` as any }]} />
            </View>
          </View>
          <Text style={s.levelSub}>{profile.xpToNextLevel.toLocaleString()} XP remaining to level {profile.level + 1}</Text>
        </View>

        {/* ── Weekly trend ──────────────────────────────────────────── */}
        <WeeklyTrendCard comparison={weeklyComparison} />

        {/* ── Rating breakdown ──────────────────────────────────────── */}
        <Text style={s.sectionLabel}>XP BY RATING</Text>
        {xpByRating.length > 0 ? (
          xpByRating.map((rating) => <RatingRow key={rating.rating} rating={rating} />)
        ) : (
          <Text style={s.emptyText}>No reviews yet</Text>
        )}

        {/* ── XP by deck ───────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>XP BY DECK</Text>
        {xpByDeck.length > 0 ? (
          xpByDeck.map((deck) => <DeckXpRow key={deck.deckId} deck={deck} />)
        ) : (
          <Text style={s.emptyText}>No decks yet</Text>
        )}

        {/* ── Daily XP heatmap ──────────────────────────────────────── */}
        <View style={{ marginTop: 20 }}>
          <XpHeatmap activity={dailyXp} />
        </View>

        {/* ── Milestones ───────────────────────────────────────────── */}
        <MilestonesSection profile={profile} />

        {/* ── Info links ───────────────────────────────────────────── */}
        <View style={s.infoSection}>
          <TouchableOpacity style={s.infoRow} onPress={() => setShowHowCalc(true)}>
            <Text style={s.infoText}>How XP is calculated</Text>
            <InfoBtn onPress={() => setShowHowCalc(true)} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.infoRow, { borderBottomWidth: 0 }]} onPress={() => setShowWhyImport(true)}>
            <Text style={s.infoText}>Why XP is important</Text>
            <InfoBtn onPress={() => setShowWhyImport(true)} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Info sheet: How XP is calculated ─────────────────────── */}
      <InfoSheet visible={showHowCalc} onClose={() => setShowHowCalc(false)} title="How XP is calculated">
        <ScrollView showsVerticalScrollIndicator={false}>
          <PRow emoji="📊" heading="Different XP for each rating" body={`Again = ${XP_PER_RATING[1]} XP, Hard = ${XP_PER_RATING[2]} XP, Good = ${XP_PER_RATING[3]} XP, Easy = ${XP_PER_RATING[4]} XP. Harder cards give more reward because you put in more cognitive effort.`} />
          <PRow emoji="🔥" heading="Streak multiplier boost" body={`Your XP multiplies with your streak: 1× normally, 2× at 7 days, 3× at 30 days. A Good rating at 30-day streak is ${XP_PER_RATING[3]} × 3 = ${XP_PER_RATING[3] * 3} XP.`} />
          <PRow emoji="📈" heading="Level progression" body="Levels follow an exponential curve. Level 1 requires 500 XP, Level 2 requires 700 XP, etc. Early levels are fast and rewarding while maintaining long-term challenge." />
          <PRow emoji="🎯" heading="XP is tracked per deck" body="All your XP combines into one total, but you can see how much each deck has contributed." last />
        </ScrollView>
      </InfoSheet>

      {/* ── Info sheet: Why XP is important ──────────────────────── */}
      <InfoSheet visible={showWhyImport} onClose={() => setShowWhyImport(false)} title="Why XP is important">
        <ScrollView showsVerticalScrollIndicator={false}>
          <PRow emoji="🎮" heading="Gamification drives consistency" body="XP and levels tap into the same reward systems that make games addictive. Watching a number go up creates positive reinforcement that keeps you studying even on tough days." />
          <PRow emoji="📊" heading="Measurable progress" body="Flashcard learning can feel abstract — did you actually get better? XP is concrete. You earned 450 XP last week. You're now level 12. This progress is visible and motivating." />
          <PRow emoji="🏆" heading="Streak multiplier incentivizes daily study" body="By multiplying XP at 7 and 30-day streaks, the system rewards consistency. You earn more XP per card if you keep the streak alive." />
          <PRow emoji="🧠" heading="Harder cards earn more" body="'Easy' cards are easy. You get more XP for 'Hard' and 'Again' reviews because they represent actual learning — places where your memory is being strengthened the most." last />
        </ScrollView>
      </InfoSheet>

    </SafeAreaView>
  )
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 60 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  backBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '500', color: Colors.text.primary },

  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  levelCard:     { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 16 },
  levelLabel:    { fontSize: 13, fontWeight: '500', color: Colors.text.primary },
  levelProgress: { fontSize: 12, color: Colors.accent.default, fontWeight: '600' },
  progressTrack: { height: 6, backgroundColor: Colors.xp.barTrack, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: Colors.accent.default },
  levelSub:      { fontSize: 12, color: Colors.text.muted },

  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 12 },

  infoSection: { marginTop: 4, marginBottom: 40, backgroundColor: Colors.bg.surface, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default, overflow: 'hidden' },
  infoRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  infoText:    { fontSize: 14, color: Colors.text.primary },

  emptyText: { fontSize: 14, color: Colors.text.muted, textAlign: 'center', marginTop: 20 },
})
