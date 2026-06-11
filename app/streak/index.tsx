import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Animated,
  Dimensions, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase }    from '../../src/context/DatabaseContext'
import {
  getProfile, getDailyActivity,
  getStreakHistory, getWeekdayActivity, getBestStats, useStreakFreeze,
} from '../../src/db/queries'
import type { UserProfile }         from '../../src/db/schema'
import type { StreakRun, WeekdayActivity, BestStats } from '../../src/db/queries'
import { STREAK_DAILY_MINIMUM }     from '../../src/db/schema'
import { Colors }                   from '../../src/theme/colors'

const { height: SCREEN_H } = Dimensions.get('window')

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

function InfoSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_H,
      useNativeDriver: true,
      tension: 65, friction: 11,
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

function StatTile({ icon, iconColor, value, label, sub }: {
  icon: string; iconColor?: string; value: string; label: string; sub?: string
}) {
  return (
    <View style={t.tile}>
      <Text style={[t.icon, iconColor ? { color: iconColor } : undefined]}>{icon}</Text>
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

// ─── Calendar ─────────────────────────────────────────────────────────────────

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function Calendar({ studiedDates, year, month, onPrev, onNext }: {
  studiedDates: Set<string>; year: number; month: number
  onPrev: () => void; onNext: () => void
}) {
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const isFuture = year > today.getFullYear() ||
                   (year === today.getFullYear() && month > today.getMonth())

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const dateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  return (
    <View style={cal.wrap}>
      <View style={cal.nav}>
        <TouchableOpacity style={cal.navBtn} onPress={onPrev}>
          <Ionicons name="chevron-back" size={18} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={cal.monthTitle}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity style={[cal.navBtn, isFuture && cal.navBtnDisabled]} onPress={onNext} disabled={isFuture}>
          <Ionicons name="chevron-forward" size={18} color={isFuture ? Colors.text.faint : Colors.text.secondary} />
        </TouchableOpacity>
      </View>
      <View style={cal.row}>
        {DAYS.map(d => <Text key={d} style={cal.dayHeader}>{d}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, wi) => (
        <View key={wi} style={cal.row}>
          {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
            if (!day) return <View key={di} style={cal.cell} />
            const ds         = dateStr(day)
            const studied    = studiedDates.has(ds)
            const isToday    = ds === todayStr
            const isFutureDay= ds > todayStr
            return (
              <View key={di} style={cal.cell}>
                <View style={[cal.dayCircle, studied && cal.dayStudied, isToday && !studied && cal.dayToday]}>
                  <Text style={[cal.dayNum, studied && cal.dayNumStudied, isToday && !studied && cal.dayNumToday, isFutureDay && cal.dayNumFuture]}>
                    {day}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}
const cal = StyleSheet.create({
  wrap:           { backgroundColor: Colors.bg.surface, borderRadius: 18, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16 },
  nav:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navBtn:         { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  monthTitle:     { fontSize: 16, fontWeight: '500', color: Colors.text.primary },
  row:            { flexDirection: 'row', marginBottom: 6 },
  dayHeader:      { flex: 1, textAlign: 'center', fontSize: 11, color: Colors.text.faint, fontWeight: '500', marginBottom: 4 },
  cell:           { flex: 1, alignItems: 'center' },
  dayCircle:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayStudied:     { backgroundColor: Colors.streak.text },
  dayToday:       { borderWidth: 1.5, borderColor: Colors.accent.default },
  dayNum:         { fontSize: 13, fontWeight: '400', color: Colors.text.secondary },
  dayNumStudied:  { color: '#000', fontWeight: '600' },
  dayNumToday:    { color: Colors.accent.default, fontWeight: '600' },
  dayNumFuture:   { color: Colors.text.faint },
})

// ─── Weekday bar chart ────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function WeekdayChart({ data }: { data: WeekdayActivity[] }) {
  const countMap: Record<number, number> = {}
  let maxCount = 1
  for (const d of data) {
    countMap[d.weekday] = d.count
    if (d.count > maxCount) maxCount = d.count
  }

  return (
    <View style={wc.wrap}>
      <Text style={wc.sectionLabel}>CONSISTENCY BY DAY</Text>
      {WEEKDAY_LABELS.map((label, i) => {
        const count    = countMap[i] ?? 0
        const fraction = count / maxCount
        return (
          <View key={i} style={wc.row}>
            <Text style={wc.label}>{label}</Text>
            <View style={wc.trackWrap}>
              <View style={[wc.bar, { flex: fraction || 0.008 }]} />
              <View style={{ flex: 1 - (fraction || 0.008) }} />
            </View>
            <Text style={wc.count}>{count}</Text>
          </View>
        )
      })}
    </View>
  )
}
const wc = StyleSheet.create({
  wrap:         { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 14 },
  row:          { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  label:        { width: 32, fontSize: 12, color: Colors.text.muted },
  trackWrap:    { flex: 1, height: 10, borderRadius: 5, backgroundColor: Colors.streak.bg, flexDirection: 'row', overflow: 'hidden' },
  bar:          { height: '100%', backgroundColor: Colors.streak.text, borderRadius: 5 },
  count:        { width: 36, fontSize: 12, color: Colors.text.secondary, textAlign: 'right' },
})

// ─── Streak history ───────────────────────────────────────────────────────────

function StreakHistorySection({ runs }: { runs: StreakRun[] }) {
  const todayStr = new Date().toISOString().slice(0, 10)

  const fmt = (start: string, end: string) => {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end   + 'T12:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    const sameYear = s.getFullYear() === e.getFullYear()
    const endOpts  = sameYear ? opts : { ...opts, year: 'numeric' as const }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', endOpts)}`
  }

  return (
    <View style={sl.wrap}>
      <Text style={sl.sectionLabel}>STREAK HISTORY</Text>
      {runs.length === 0 ? (
        <View style={sl.empty}>
          <Text style={sl.emptyText}>No streaks yet</Text>
          <Text style={sl.emptySub}>Study {STREAK_DAILY_MINIMUM}+ cards daily to start your first streak</Text>
        </View>
      ) : (
        runs.map((run, i) => {
          const isActive = run.endDate >= todayStr
          return (
            <View key={i} style={[sl.row, i === runs.length - 1 && sl.rowLast]}>
              <Text style={sl.flame}>🔥</Text>
              <View style={sl.info}>
                <Text style={sl.days}>{run.length} day{run.length !== 1 ? 's' : ''}</Text>
                <Text style={sl.dates}>{fmt(run.startDate, run.endDate)}</Text>
              </View>
              {isActive && (
                <View style={sl.activeBadge}>
                  <Text style={sl.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
          )
        })
      )}
    </View>
  )
}
const sl = StyleSheet.create({
  wrap:            { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, overflow: 'hidden', marginBottom: 12 },
  sectionLabel:    { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  row:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border.subtle },
  rowLast:         {},
  flame:           { fontSize: 20 },
  info:            { flex: 1 },
  days:            { fontSize: 15, fontWeight: '500', color: Colors.text.primary },
  dates:           { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  activeBadge:     { backgroundColor: Colors.streak.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: Colors.streak.border },
  activeBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.streak.text },
  empty:           { paddingHorizontal: 16, paddingBottom: 16 },
  emptyText:       { fontSize: 14, color: Colors.text.secondary },
  emptySub:        { fontSize: 12, color: Colors.text.muted, marginTop: 4 },
})

// ─── Streak freeze card ───────────────────────────────────────────────────────

function StreakFreezeCard({ profile, onUseFreeze }: {
  profile: UserProfile; onUseFreeze: () => void
}) {
  const todayStr     = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const streakAtRisk = profile.currentStreak > 0 &&
    profile.lastStudyDate !== todayStr &&
    profile.lastStudyDate !== yesterdayStr
  const canUse = profile.streakFreezes > 0 && streakAtRisk

  return (
    <View style={sf.wrap}>
      <View style={sf.topRow}>
        <View style={sf.iconCircle}>
          <Text style={{ fontSize: 22 }}>🧊</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sf.title}>Streak Freeze</Text>
          <Text style={sf.sub}>
            {profile.streakFreezes === 0
              ? 'No freezes — earn one at your next 7-day milestone'
              : `${profile.streakFreezes} freeze${profile.streakFreezes !== 1 ? 's' : ''} available`}
          </Text>
        </View>
        <View style={[sf.countBadge, profile.streakFreezes > 0 && sf.countBadgeActive]}>
          <Text style={[sf.countText, profile.streakFreezes > 0 && sf.countTextActive]}>
            {profile.streakFreezes}
          </Text>
        </View>
      </View>

      {streakAtRisk && (
        <View style={sf.riskRow}>
          <Ionicons name="warning-outline" size={13} color={Colors.semantic.warning} />
          <Text style={sf.riskText}>Your streak is at risk — use a freeze to protect it</Text>
        </View>
      )}

      <TouchableOpacity
        style={[sf.btn, !canUse && sf.btnDisabled]}
        onPress={onUseFreeze}
        disabled={!canUse}
        activeOpacity={0.8}
      >
        <Ionicons name="shield-checkmark-outline" size={15} color={canUse ? Colors.accent.default : Colors.text.faint} />
        <Text style={[sf.btnText, !canUse && sf.btnTextDisabled]}>
          {profile.streakFreezes === 0
            ? 'No freezes available'
            : !streakAtRisk
            ? 'Streak is safe'
            : 'Use Freeze — protect streak'}
        </Text>
      </TouchableOpacity>

      <Text style={sf.hint}>Earn 1 freeze at every 7-day milestone (7, 14, 21… days)</Text>
    </View>
  )
}
const sf = StyleSheet.create({
  wrap:           { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 12 },
  topRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle:     { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(133,183,235,0.12)', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  sub:            { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  countBadge:     { minWidth: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 0.5, borderColor: Colors.border.default },
  countBadgeActive: { backgroundColor: 'rgba(133,183,235,0.15)', borderColor: 'rgba(133,183,235,0.3)' },
  countText:      { fontSize: 16, fontWeight: '600', color: Colors.text.muted },
  countTextActive:{ color: Colors.semantic.info },
  riskRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.semantic.warningDim, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 0.5, borderColor: 'rgba(250,199,117,0.2)' },
  riskText:       { fontSize: 12, color: Colors.semantic.warning, flex: 1 },
  btn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 11, backgroundColor: Colors.accent.dim, borderWidth: 0.5, borderColor: 'rgba(167,139,250,0.3)', marginBottom: 10 },
  btnDisabled:    { backgroundColor: Colors.bg.elevated, borderColor: Colors.border.default },
  btnText:        { fontSize: 13, fontWeight: '500', color: Colors.accent.default },
  btnTextDisabled:{ color: Colors.text.faint },
  hint:           { fontSize: 11, color: Colors.text.faint, textAlign: 'center' },
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

export default function StreakScreen() {
  const { db } = useDatabase()
  const router = useRouter()

  const [profile,        setProfile]        = useState<UserProfile | null>(null)
  const [activeDays,     setActiveDays]      = useState(0)
  const [studiedDates,   setStudiedDates]    = useState<Set<string>>(new Set())
  const [streakHistory,  setStreakHistory]   = useState<StreakRun[]>([])
  const [weekdayData,    setWeekdayData]     = useState<WeekdayActivity[]>([])
  const [bestStats,      setBestStats]       = useState<BestStats>({ bestWeekCount: 0, bestMonthCount: 0 })
  const [loading,        setLoading]         = useState(true)

  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  const [showHowCalc,   setShowHowCalc]   = useState(false)
  const [showWhyImport, setShowWhyImport] = useState(false)
  const [showFreezeInfo,setShowFreezeInfo]= useState(false)

  const load = useCallback(async () => {
    const [prof, activity, history, weekday, best] = await Promise.all([
      getProfile(db),
      getDailyActivity(db, 365),
      getStreakHistory(db),
      getWeekdayActivity(db),
      getBestStats(db),
    ])
    setProfile(prof)
    setActiveDays(activity.length)
    setStudiedDates(new Set(activity.map(a => a.date)))
    setStreakHistory(history)
    setWeekdayData(weekday)
    setBestStats(best)
  }, [db])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const handleUseFreeze = useCallback(async () => {
    if (!profile) return
    Alert.alert(
      'Use Streak Freeze?',
      `This will protect your ${profile.currentStreak}-day streak. You have ${profile.streakFreezes} freeze${profile.streakFreezes !== 1 ? 's' : ''} remaining.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Freeze',
          onPress: async () => {
            const ok = await useStreakFreeze(db)
            if (ok) {
              await load()
              Alert.alert('Freeze used', 'Your streak is protected! Study today to keep it going.')
            }
          },
        },
      ]
    )
  }, [db, profile, load])

  if (loading || !profile) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Activity</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Streak + Longest tiles ─────────────────────────────────── */}
        <View style={s.tilesRow}>
          <StatTile icon="🔥" iconColor={Colors.streak.text}    value={String(profile.currentStreak)} label="Days streak" />
          <StatTile icon="🏆" iconColor={Colors.accent.default} value={String(profile.longestStreak)} label="Longest streak" />
        </View>

        {/* ── Best week + Best month tiles ────────────────────────────── */}
        <View style={[s.tilesRow, { marginBottom: 12 }]}>
          <StatTile icon="📅" value={String(bestStats.bestWeekCount)}  label="Best week"  sub="cards" />
          <StatTile icon="🗓" value={String(bestStats.bestMonthCount)} label="Best month" sub="cards" />
        </View>

        {/* ── Active days card ─────────────────────────────────────────── */}
        <View style={s.activeDaysCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={s.activeDaysIcon}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.semantic.success} />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={s.activeDaysNum}>{activeDays}</Text>
                <Text style={s.activeDaysLabel}>Active days</Text>
              </View>
              <Text style={s.activeDaysSub}>Days you studied at least {STREAK_DAILY_MINIMUM} cards</Text>
            </View>
          </View>
        </View>

        {/* ── Weekday bar chart ────────────────────────────────────────── */}
        <WeekdayChart data={weekdayData} />

        {/* ── Calendar ─────────────────────────────────────────────────── */}
        <Calendar
          studiedDates={studiedDates}
          year={calYear} month={calMonth}
          onPrev={prevMonth} onNext={nextMonth}
        />

        {/* ── Calendar legend ───────────────────────────────────────────── */}
        <View style={s.legend}>
          {[
            { color: Colors.streak.text, label: 'Studied' },
            { color: 'transparent', border: Colors.accent.default, label: 'Today' },
            { color: Colors.bg.surface, label: 'Not studied' },
          ].map((item, i) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendDot, {
                backgroundColor: item.color,
                borderWidth: item.border ? 1.5 : 0,
                borderColor: item.border,
              }]} />
              <Text style={s.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Streak history ────────────────────────────────────────────── */}
        <StreakHistorySection runs={streakHistory} />

        {/* ── Streak freeze ─────────────────────────────────────────────── */}
        <StreakFreezeCard profile={profile} onUseFreeze={handleUseFreeze} />

        {/* ── Info links ───────────────────────────────────────────────── */}
        <View style={s.infoSection}>
          <TouchableOpacity style={s.infoRow} onPress={() => setShowHowCalc(true)}>
            <Text style={s.infoText}>How streak is calculated</Text>
            <InfoBtn onPress={() => setShowHowCalc(true)} />
          </TouchableOpacity>
          <TouchableOpacity style={s.infoRow} onPress={() => setShowWhyImport(true)}>
            <Text style={s.infoText}>Why streak is important</Text>
            <InfoBtn onPress={() => setShowWhyImport(true)} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.infoRow, { borderBottomWidth: 0 }]} onPress={() => setShowFreezeInfo(true)}>
            <Text style={s.infoText}>How streak freeze works</Text>
            <InfoBtn onPress={() => setShowFreezeInfo(true)} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Info sheet: How streak is calculated ─────────────────────── */}
      <InfoSheet visible={showHowCalc} onClose={() => setShowHowCalc(false)} title="How streak is calculated">
        <ScrollView showsVerticalScrollIndicator={false}>
          <PRow emoji="🃏" heading={`Minimum ${STREAK_DAILY_MINIMUM} cards per day`} body={`You must review at least ${STREAK_DAILY_MINIMUM} cards in a single day for that day to count toward your streak. Opening the app or reviewing just 1–2 cards is not enough.`} />
          <PRow emoji="📅" heading="Consecutive days" body={`Your streak increases by 1 each day you hit the minimum. If you miss a day — even by one card — the streak resets to 0.`} />
          <PRow emoji="⚡" heading="XP multiplier kicks in" body={`Once you cross the ${STREAK_DAILY_MINIMUM}-card threshold each day, your XP multiplier activates — 2× at 7 days, 3× at 30 days.`} />
          <PRow emoji="🌙" heading="Resets at midnight" body="The daily count resets at midnight local time. Cards reviewed after midnight count toward the next day." last />
        </ScrollView>
      </InfoSheet>

      {/* ── Info sheet: Why streak is important ──────────────────────── */}
      <InfoSheet visible={showWhyImport} onClose={() => setShowWhyImport(false)} title="Why streak is important">
        <ScrollView showsVerticalScrollIndicator={false}>
          <PRow emoji="🧠" heading="Spaced repetition needs consistency" body="The FSRS algorithm schedules cards based on precise timing. Studying daily means cards appear exactly when your memory is about to fade — the optimal moment to reinforce it." />
          <PRow emoji="📈" heading="Small daily effort beats cramming" body="20 minutes every day is far more effective than 3 hours once a week. Daily contact with the language builds automatic recall." />
          <PRow emoji="🔁" heading="Habits compound" body="Research on habit formation shows that consistency — not intensity — is what makes a new behaviour stick. After 3–4 weeks of daily study, it stops feeling like effort." />
          <PRow emoji="🎯" heading="The streak is a proxy for results" body="Users who maintain a 30-day streak retain vocabulary at 85–90% accuracy compared to 40–60% for irregular studiers." last />
        </ScrollView>
      </InfoSheet>

      {/* ── Info sheet: Streak freeze ─────────────────────────────────── */}
      <InfoSheet visible={showFreezeInfo} onClose={() => setShowFreezeInfo(false)} title="How streak freeze works">
        <ScrollView showsVerticalScrollIndicator={false}>
          <PRow emoji="🧊" heading="What is a streak freeze?" body="A streak freeze protects your streak for one missed day. Using it marks yesterday as studied, so your streak doesn't break when you review today." />
          <PRow emoji="🎁" heading="How to earn freezes" body="You automatically earn 1 freeze every time you reach a 7-day streak milestone (7, 14, 21, 28… days). You start with 1 freeze for free." />
          <PRow emoji="⚠️" heading="When to use it" body="Use a freeze when you realise you missed yesterday and your streak is at risk. The button activates automatically when your streak is in danger." />
          <PRow emoji="💡" heading="Use them wisely" body="Freezes are limited. The best strategy is to study daily and save freezes for genuine emergencies — travel, illness, or an unusually busy day." last />
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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '500', color: Colors.text.primary },

  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  activeDaysCard: { backgroundColor: Colors.bg.surface, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default, padding: 16, marginBottom: 12 },
  activeDaysIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.semantic.successDim, alignItems: 'center', justifyContent: 'center' },
  activeDaysNum:   { fontSize: 22, fontWeight: '500', color: Colors.text.primary },
  activeDaysLabel: { fontSize: 14, color: Colors.text.secondary },
  activeDaysSub:   { fontSize: 11, color: Colors.text.faint, marginTop: 2 },

  legend:     { flexDirection: 'row', gap: 20, justifyContent: 'center', paddingVertical: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.text.muted },

  infoSection: { marginTop: 4, marginBottom: 8, backgroundColor: Colors.bg.surface, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default, overflow: 'hidden' },
  infoRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  infoText:    { fontSize: 14, color: Colors.text.primary },
})
