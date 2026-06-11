/**
 * app/(tabs)/profile.tsx  — Profile screen
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  View, Text, StyleSheet,
  ScrollView, ActivityIndicator, TouchableOpacity,
  TextInput, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase }      from '../../src/context/DatabaseContext'
import { useAuth }          from '../../src/context/AuthContext'
import {
  getProfile, updateDisplayName, getDeckStats, getDecks, getMasteredCount,
} from '../../src/db/queries'
import { pushAll, getLastSyncedAt } from '../../src/sync/syncService'
import type { UserProfile, Deck } from '../../src/db/schema'
import { xpForLevel, STREAK_DAILY_MINIMUM } from '../../src/db/schema'
import { Colors } from '../../src/theme/colors'

// ─── XP progress bar ─────────────────────────────────────────────────────────

function XpBar({ profile, onPress }: { profile: UserProfile; onPress: () => void }) {
  const xpThisLevel = xpForLevel(profile.level)
  const xpNextLevel = xpForLevel(profile.level + 1)
  const xpIntoLevel = profile.totalXp - xpThisLevel
  const xpNeeded    = xpNextLevel - xpThisLevel
  const pct         = Math.min(1, xpIntoLevel / xpNeeded)

  return (
    <TouchableOpacity style={xb.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={xb.header}>
        <View style={xb.left}>
          <Text style={xb.levelLabel}>Level {profile.level}</Text>
          <Text style={xb.sub}>
            {profile.totalXp.toLocaleString()} XP  ·  {(xpNextLevel - profile.totalXp).toLocaleString()} to next level
          </Text>
        </View>
        <View style={xb.right}>
          <Text style={xb.next}>Level {profile.level + 1}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.text.faint} style={{ marginTop: 2 }} />
        </View>
      </View>
      <View style={xb.track}>
        <View style={[xb.fill, { width: `${pct * 100}%` }]} />
      </View>
    </TouchableOpacity>
  )
}

const xb = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 16, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, marginBottom: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  left:   { flex: 1 },
  right:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  levelLabel: { fontSize: 15, fontWeight: '500', color: Colors.text.primary, marginBottom: 3 },
  sub:        { fontSize: 11, color: Colors.text.muted },
  next:       { fontSize: 12, color: Colors.text.faint },
  track: {
    height: 6, backgroundColor: Colors.xp.barTrack,
    borderRadius: 3, overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: Colors.xp.bar, borderRadius: 3 },
})

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={st.tile}>
      <Text style={[st.value, color ? { color } : {}]}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, alignItems: 'center',
  },
  value: { fontSize: 20, fontWeight: '500', color: Colors.text.primary },
  label: { fontSize: 10, color: Colors.text.muted, marginTop: 4, textAlign: 'center' },
})

// ─── Quick-nav tile ───────────────────────────────────────────────────────────

function NavTile({
  icon, title, sub, accent, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string; sub: string; accent: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={[nt.tile, { borderColor: `${accent}40` }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[nt.iconWrap, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={nt.title}>{title}</Text>
        <Text style={nt.sub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.text.faint} />
    </TouchableOpacity>
  )
}

const nt = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 13, fontWeight: '500', color: Colors.text.primary },
  sub:      { fontSize: 11, color: Colors.text.muted, marginTop: 2 },
})

// ─── Deck row ─────────────────────────────────────────────────────────────────

function DeckRow({ deck }: { deck: Deck }) {
  return (
    <View style={dr.row}>
      <Text style={dr.emoji}>{deck.emoji ?? '📚'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={dr.name}>{deck.name}</Text>
        <Text style={dr.meta}>{deck.cardCount} cards  ·  {deck.dueCount} due</Text>
      </View>
    </View>
  )
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.surface,
    borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 12, marginBottom: 6,
  },
  emoji: { fontSize: 22 },
  name:  { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  meta:  { fontSize: 11, color: Colors.text.muted, marginTop: 2 },
})

// ─── Profile screen ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { db }               = useDatabase()
  const { user, signOut }    = useAuth()
  const router               = useRouter()

  const [profile,   setProfile]   = useState<UserProfile | null>(null)
  const [decks,     setDecks]     = useState<Deck[]>([])
  const [retention, setRetention] = useState(0)
  const [mastered,  setMastered]  = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [syncing,   setSyncing]   = useState(false)
  const [lastSync,  setLastSync]  = useState<number | null>(null)

  useEffect(() => { getLastSyncedAt().then(setLastSync) }, [])

  const handleSync = async () => {
    if (!user || syncing) return
    setSyncing(true)
    try {
      await pushAll(db, user.id)
      const ts = Date.now(); setLastSync(ts)
    } catch (e: any) {
      Alert.alert('Sync failed', e?.message ?? 'Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Your local data will remain on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ])
  }

  const syncLabel = lastSync
    ? (() => {
        const mins = Math.floor((Date.now() - lastSync) / 60_000)
        if (mins < 1)  return 'Synced just now'
        if (mins < 60) return `Synced ${mins}m ago`
        return `Synced ${Math.floor(mins / 60)}h ago`
      })()
    : 'Not synced yet'

  const load = async () => {
    const [p, d, m] = await Promise.all([
      getProfile(db),
      getDecks(db),
      getMasteredCount(db),
    ])
    setProfile(p)
    setDecks(d)
    setMastered(m)
    setNameInput(p?.displayName ?? '')

    if (d.length > 0) {
      const stats = await Promise.all(d.map((dk) => getDeckStats(db, dk.id)))
      const totalReviews = stats.reduce((sum, s) => sum + s.total, 0)
      const totalCorrect = stats.reduce((sum, s) => sum + Math.round(s.retention * s.total), 0)
      setRetention(totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0)
    }
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [db])

  const handleSaveName = async () => {
    if (!nameInput.trim()) { Alert.alert('Name cannot be empty'); return }
    await updateDisplayName(db, nameInput.trim())
    setEditing(false)
    await load()
  }

  if (loading || !profile) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  const totalTimeHrs = (profile.totalStudyTimeMs / 3_600_000).toFixed(1)

  const levelTier =
    profile.level >= 30 ? '💎' :
    profile.level >= 20 ? '🥇' :
    profile.level >= 10 ? '🥈' : '🥉'

  const memberSince = (() => {
    const d = new Date(profile.createdAt)
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  })()

  const daily     = profile.dailyReviewsCount ?? 0
  const minCards  = STREAK_DAILY_MINIMUM
  const pct       = Math.min(1, daily / minCards)
  const reached   = daily >= minCards

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarLetter}>
              {profile.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>

          {editing ? (
            <View style={s.nameRow}>
              <TextInput
                style={s.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                selectTextOnFocus
              />
              <TouchableOpacity onPress={handleSaveName} style={s.saveBtn}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={s.cancelBtn}>
                <Ionicons name="close" size={16} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={() => setEditing(true)}>
              <Text style={s.displayName}>{profile.displayName}</Text>
              <Ionicons name="pencil-outline" size={14} color={Colors.text.faint} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}

          <Text style={s.memberSince}>Member since {memberSince}</Text>

          <View style={s.badgeRow}>
            <View style={s.badge}>
              <Text style={s.badgeText}>{levelTier} Level {profile.level}</Text>
            </View>
            {profile.currentStreak > 0 && (
              <View style={[s.badge, { backgroundColor: Colors.streak.bg, borderColor: Colors.streak.border }]}>
                <Text style={[s.badgeText, { color: Colors.streak.text }]}>
                  🔥 {profile.currentStreak}d streak
                </Text>
              </View>
            )}
            {profile.streakFreezes > 0 && (
              <View style={[s.badge, { backgroundColor: 'rgba(133,183,235,0.12)', borderColor: 'rgba(133,183,235,0.25)' }]}>
                <Text style={[s.badgeText, { color: Colors.semantic.info }]}>
                  🛡️ {profile.streakFreezes}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── XP progress ─────────────────────────────────────────────────── */}
        <XpBar profile={profile} onPress={() => router.push('/xp')} />

        {/* ── Stats grid ──────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>LIFETIME STATS</Text>
        <View style={s.statsGrid}>
          <View style={s.statsRow}>
            <StatTile value={profile.totalReviews.toLocaleString()} label="Total reviews" />
            <StatTile value={`${retention}%`} label="Retention" color={Colors.semantic.success} />
          </View>
          <View style={s.statsRow}>
            <StatTile value={mastered.toLocaleString()} label="Cards mastered" color={Colors.accent.default} />
            <StatTile value={`${totalTimeHrs}h`} label="Study time" color={Colors.semantic.info} />
          </View>
        </View>

        {/* ── Quick nav ───────────────────────────────────────────────────── */}
        <View style={s.navRow}>
          <NavTile
            icon="flame-outline"
            title="Streak"
            sub={`Current ${profile.currentStreak}d · Best ${profile.longestStreak}d`}
            accent={Colors.streak.text}
            onPress={() => router.push('/streak')}
          />
          <NavTile
            icon="star-outline"
            title="XP & Level"
            sub={`${profile.totalXp.toLocaleString()} total XP`}
            accent={Colors.accent.default}
            onPress={() => router.push('/xp')}
          />
        </View>

        {/* ── Today's progress ────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>TODAY</Text>
        <View style={s.dailyCard}>
          <View style={s.dailyHeader}>
            <Text style={s.dailyTitle}>
              {reached ? '✅ Streak earned today!' : "Today's progress"}
            </Text>
            <Text style={[s.dailyCount, reached && { color: Colors.semantic.success }]}>
              {daily} / {minCards} cards
            </Text>
          </View>
          <View style={s.dailyTrack}>
            <View style={[s.dailyFill, {
              width: `${pct * 100}%` as any,
              backgroundColor: reached ? Colors.semantic.success : Colors.accent.default,
            }]} />
          </View>
          <Text style={s.dailyHint}>
            {reached
              ? 'Great work — this day counts toward your streak 🔥'
              : `Review ${minCards - daily} more card${minCards - daily !== 1 ? 's' : ''} to earn today's streak`}
          </Text>
        </View>

        {/* ── Decks ───────────────────────────────────────────────────────── */}
        {decks.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>
              MY DECKS  ({decks.length})
            </Text>
            {decks.map((deck) => <DeckRow key={deck.id} deck={deck} />)}
          </>
        )}

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>NOTIFICATIONS</Text>
        <TouchableOpacity
          style={s.settingsRow}
          onPress={() => router.push('/notifications')}
        >
          <View style={s.settingsIcon}>
            <Ionicons name="notifications-outline" size={18} color={Colors.accent.default} />
          </View>
          <Text style={s.settingsLabel}>View notifications</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
        </TouchableOpacity>

        {/* ── Sync ────────────────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>SYNC</Text>
        {user ? (
          <View style={s.syncCard}>
            <View style={s.syncRow}>
              <View style={s.syncIconWrap}>
                <Ionicons name="cloud-done-outline" size={18} color="#4ade80" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.syncEmail}>{user.email}</Text>
                <Text style={s.syncStatus}>{syncLabel}</Text>
              </View>
              <TouchableOpacity
                style={[s.syncBtn, syncing && { opacity: 0.5 }]}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing
                  ? <ActivityIndicator size="small" color={Colors.accent.default} />
                  : <Ionicons name="sync-outline" size={18} color={Colors.accent.default} />
                }
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={16} color={Colors.semantic.error} />
              <Text style={s.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={s.signInPrompt}
            onPress={() => router.push('/auth')}
            activeOpacity={0.8}
          >
            <View style={s.syncIconWrap}>
              <Ionicons name="cloud-outline" size={18} color={Colors.accent.default} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.signInTitle}>Sync across devices</Text>
              <Text style={s.signInSub}>Sign in to back up and sync your progress</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <Text style={s.footer}>Powered by FSRS-5 spaced repetition</Text>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },

  // Hero
  hero: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent.dim,
    borderWidth: 2.5, borderColor: 'rgba(167,139,250,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  avatarLetter: { fontSize: 30, fontWeight: '500', color: Colors.accent.default },

  nameRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  displayName: { fontSize: 20, fontWeight: '500', color: Colors.text.primary },
  nameInput: {
    fontSize: 20, fontWeight: '500', color: Colors.text.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.accent.default,
    minWidth: 120, paddingVertical: 2, marginRight: 8,
  },
  saveBtn: {
    backgroundColor: Colors.accent.default,
    borderRadius: 8, padding: 5, marginRight: 6,
  },
  cancelBtn: { padding: 5 },

  memberSince: { fontSize: 12, color: Colors.text.muted, marginBottom: 12 },

  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badge: {
    backgroundColor: Colors.accent.dim,
    borderWidth: 0.5, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '500', color: Colors.accent.default },

  // Section label
  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.text.muted,
    letterSpacing: 0.06, marginBottom: 10,
  },

  // Stats grid
  statsGrid: { gap: 8, marginBottom: 10 },
  statsRow:  { flexDirection: 'row', gap: 8 },

  // Quick nav
  navRow: { flexDirection: 'row', gap: 8, marginTop: 4 },

  // Today's progress
  dailyCard: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14,
  },
  dailyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  dailyTitle: { fontSize: 13, fontWeight: '500', color: Colors.text.primary },
  dailyCount: { fontSize: 13, fontWeight: '500', color: Colors.accent.default },
  dailyTrack: {
    height: 6, backgroundColor: Colors.xp.barTrack,
    borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  dailyFill:  { height: '100%', borderRadius: 3 },
  dailyHint:  { fontSize: 12, color: Colors.text.muted, lineHeight: 17 },

  // Settings
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, marginBottom: 6,
  },
  settingsIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: 15, color: Colors.text.primary },

  // Sync
  syncCard: {
    backgroundColor: Colors.bg.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  syncRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  syncIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  syncEmail:  { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  syncStatus: { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  syncBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center',
  },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 0.5, borderTopColor: Colors.border.subtle,
    padding: 12, paddingLeft: 14,
  },
  signOutText: { fontSize: 14, color: Colors.semantic.error, fontWeight: '500' },

  signInPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14,
  },
  signInTitle: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  signInSub:   { fontSize: 12, color: Colors.text.muted, marginTop: 2 },

  // Footer
  footer: {
    fontSize: 11, color: Colors.text.faint,
    textAlign: 'center', marginTop: 32,
  },
})
