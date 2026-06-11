/**
 * app/(tabs)/index.tsx — Home screen  (Design A)
 *
 * Nav bar: streak + XP pills left · WordFlip center · settings right
 * Below: greeting · session card · deck list · FAB
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Pressable, ActivityIndicator, RefreshControl,
  Modal, TextInput, Alert, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase } from '../../src/context/DatabaseContext'
import {
  getDecks, getTotalDueCount, createDeck, archiveDeck, getProfile,
  getUnreadNotificationCount, repairStreak,
} from '../../src/db/queries'
import type { Deck, UserProfile } from '../../src/db/schema'
import { Colors } from '../../src/theme/colors'
import { scheduleStreakReminder } from '../../src/notifications/streakReminder'

// Language codes
const LANGUAGE_CODES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sr', name: 'Serbian' },
]

// Emoji categories
const EMOJI_CATEGORIES = {
  'Flags': ['🇬🇧', '🇩🇪', '🇯🇵', '🇫🇷', '🇪🇸', '🇮🇹', '🇵🇹', '🇷🇺', '🇰🇷', '🇨🇳', '🇸🇦', '🇮🇳', '🇹🇷', '🇵🇱', '🇳🇱', '🇷🇸'],
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖'],
  'Objects': ['📚', '🎓', '📖', '✏️', '📝', '🎯', '🧠', '💡', '⚡', '🔥', '⭐', '🌟', '✨', '💫', '🎨', '🎭'],
}

const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat()

function estimateMinutes(count: number) {
  return Math.max(1, Math.round((count * 35) / 60))
}

// ─── Language picker for modal ────────────────────────────────────────────────

function LanguagePickerModal({ visible, onClose, onSelect, title }: {
  visible: boolean
  onClose: () => void
  onSelect: (code: string) => void
  title: string
}) {
  const [search, setSearch] = useState('')

  const filtered = LANGUAGE_CODES.filter(
    l => l.code.includes(search.toLowerCase()) || l.name.toLowerCase().includes(search.toLowerCase())
  )

  if (!visible) return null

  return (
    <Modal transparent animationType="none" onRequestClose={onClose} visible={visible}>
      <Pressable style={lpm.backdrop} onPress={onClose} />
      <View style={lpm.sheet}>
        <View style={lpm.header}>
          <Text style={lpm.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={lpm.searchInput}
          placeholder="Search..."
          placeholderTextColor={Colors.text.faint}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />

        <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={lpm.langRow}
              onPress={() => {
                onSelect(lang.code)
                onClose()
              }}
            >
              <Text style={lpm.langName}>{lang.name}</Text>
              <Text style={lpm.langCode}>{lang.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

const lpm = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 30, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '500', color: Colors.text.primary },
  searchInput: { backgroundColor: Colors.bg.surface, borderRadius: 10, borderWidth: 0.5, borderColor: Colors.border.default, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text.primary, fontSize: 13, marginBottom: 10 },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  langName: { fontSize: 14, color: Colors.text.primary },
  langCode: { fontSize: 11, color: Colors.text.muted, fontWeight: '500' },
})

// ─── Emoji picker for modal ────────────────────────────────────────────────────

function EmojiPickerModal({ visible, onClose, onSelect }: {
  visible: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = search.trim() === '' ? ALL_EMOJIS : ALL_EMOJIS.filter(e => e.includes(search))

  if (!visible) return null

  return (
    <Modal transparent animationType="none" onRequestClose={onClose} visible={visible}>
      <Pressable style={epm.backdrop} onPress={onClose} />
      <View style={epm.sheet}>
        <View style={epm.header}>
          <Text style={epm.title}>Choose emoji</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <View style={epm.searchWrap}>
          <Ionicons name="search" size={14} color={Colors.text.faint} style={epm.searchIcon} />
          <TextInput style={epm.searchInput} placeholder="Search..." placeholderTextColor={Colors.text.faint} value={search} onChangeText={setSearch} autoFocus />
        </View>

        <ScrollView style={epm.grid} showsVerticalScrollIndicator={false}>
          {search.trim() === '' ? (
            Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <View key={category}>
                <Text style={epm.categoryLabel}>{category}</Text>
                <View style={epm.emojiGrid}>
                  {emojis.map((emoji, i) => (
                    <TouchableOpacity key={i} style={epm.emojiBtn} onPress={() => { onSelect(emoji); onClose() }}>
                      <Text style={epm.emojiBtnText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View style={epm.emojiGrid}>
              {filtered.length > 0 ? (
                filtered.map((emoji, i) => (
                  <TouchableOpacity key={i} style={epm.emojiBtn} onPress={() => { onSelect(emoji); onClose() }}>
                    <Text style={epm.emojiBtnText}>{emoji}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={epm.noResults}>No emoji found</Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const epm = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 12, paddingBottom: 30, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '500', color: Colors.text.primary },
  searchWrap: { position: 'relative', marginBottom: 10 },
  searchIcon: { position: 'absolute', left: 10, top: 10, zIndex: 1 },
  searchInput: { backgroundColor: Colors.bg.surface, borderRadius: 10, borderWidth: 0.5, borderColor: Colors.border.default, paddingHorizontal: 36, paddingVertical: 8, color: Colors.text.primary, fontSize: 13 },
  grid: { flex: 1 },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: Colors.text.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 6, textTransform: 'uppercase' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 2 },
  emojiBtn: { width: '12.5%', aspectRatio: 1, borderRadius: 6, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 18 },
  noResults: { textAlign: 'center', paddingVertical: 30, color: Colors.text.muted, fontSize: 13 },
})

// ─── New deck modal ────────────────────────────────────────────────────────────

function NewDeckModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void
  onSave: (name: string, sourceLanguage: string, targetLanguage: string, emoji: string) => void
}) {
  const [name, setName] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('en')
  const [targetLanguage, setTargetLanguage] = useState('')
  const [emoji, setEmoji] = useState('📚')

  const [showSourceLang, setShowSourceLang] = useState(false)
  const [showTargetLang, setShowTargetLang] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)

  const save = () => {
    if (!name.trim()) { Alert.alert('Error', 'Deck name is required'); return }
    if (!targetLanguage.trim()) { Alert.alert('Error', 'Target language is required'); return }
    onSave(name.trim(), sourceLanguage, targetLanguage, emoji || '📚')
    setName(''); setSourceLanguage('en'); setTargetLanguage(''); setEmoji('📚')
  }

  const getLangName = (code: string) => {
    const lang = LANGUAGE_CODES.find(l => l.code === code)
    return lang ? lang.name : code.toUpperCase()
  }

  const handleClose = () => {
    setName(''); setSourceLanguage('en'); setTargetLanguage(''); setEmoji('📚')
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>New deck</Text>

          <Text style={s.inputLabel}>Deck name</Text>
          <TextInput style={s.input} placeholder="e.g. Deutsch A1"
            placeholderTextColor={Colors.text.faint} value={name}
            onChangeText={setName} autoFocus />

          <Text style={s.inputLabel}>Source language (you know)</Text>
          <TouchableOpacity style={s.langButton} onPress={() => setShowSourceLang(true)}>
            <Text style={s.langButtonText}>{getLangName(sourceLanguage)}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>

          <Text style={s.inputLabel}>Target language (learning)</Text>
          <TouchableOpacity style={s.langButton} onPress={() => setShowTargetLang(true)}>
            <Text style={s.langButtonText}>{targetLanguage ? getLangName(targetLanguage) : 'Select language'}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>

          <Text style={s.inputLabel}>Icon emoji</Text>
          <TouchableOpacity style={s.langButton} onPress={() => setShowEmoji(true)}>
            <Text style={s.emojiDisplay}>{emoji}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>

          <View style={s.modalBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
              <Text style={{ fontSize: 14, color: Colors.text.secondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={save}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Create deck</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <LanguagePickerModal visible={showSourceLang} onClose={() => setShowSourceLang(false)} onSelect={setSourceLanguage} title="Source language" />
      <LanguagePickerModal visible={showTargetLang} onClose={() => setShowTargetLang(false)} onSelect={setTargetLanguage} title="Target language" />
      <EmojiPickerModal visible={showEmoji} onClose={() => setShowEmoji(false)} onSelect={setEmoji} />
    </Modal>
  )
}

// ─── Settings modal ────────────────────────────────────────────────────────────

function SettingsModal({ visible, onClose, onAction }: {
  visible: boolean
  onClose: () => void
  onAction: (action: string) => void
}) {
  const sections = [
    {
      title: 'Decks',
      items: [
        { icon: 'add-circle-outline',    label: 'New deck',         action: 'new-deck', accent: true  },
        { icon: 'swap-vertical-outline', label: 'Sort decks A → Z', action: 'sort',     accent: false },
        { icon: 'archive-outline',       label: 'Manage archived',  action: 'archived', accent: false },
      ],
    },
    {
      title: 'App',
      items: [
        { icon: 'person-outline', label: 'Profile & stats', action: 'profile', accent: false },
      ],
    },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={s.sheetTitle}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {sections.map((section, si) => (
            <View key={si} style={{ marginBottom: 14 }}>
              <Text style={s.settingsSectionLabel}>{section.title}</Text>
              <View style={s.settingsGroup}>
                {section.items.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.settingsRow, i === section.items.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { onClose(); onAction(item.action) }}
                  >
                    <View style={[s.settingsIcon, item.accent && { backgroundColor: Colors.accent.dim, borderColor: 'rgba(167,139,250,0.25)' }]}>
                      <Ionicons
                        name={item.icon as any}
                        size={19}
                        color={item.accent ? Colors.accent.default : Colors.text.secondary}
                      />
                    </View>
                    <Text style={s.settingsLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.text.faint} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  )
}

// ─── Deck row ──────────────────────────────────────────────────────────────────

function DeckRow({ deck, onPress, onLongPress }: {
  deck: Deck; onPress: () => void; onLongPress: () => void
}) {
  const done = deck.dueCount === 0
  return (
    <Pressable
      style={[s.deckRow, done && s.deckRowDone]}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
    >
      <View style={s.deckIcon}>
        <Text style={{ fontSize: 20 }}>{deck.emoji ?? '📚'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.deckName, done && { color: Colors.text.muted }]}>{deck.name}</Text>
        <Text style={s.deckMeta}>
          {deck.cardCount} cards{deck.targetLanguage ? `  ·  ${deck.targetLanguage.toUpperCase()}` : ''}
          {!done && deck.newCount > 0 ? `  ·  ${deck.newCount} new` : ''}
        </Text>
      </View>
      {done
        ? <Text style={s.doneBadge}>done</Text>
        : <View style={s.duePill}><Text style={s.duePillText}>{deck.dueCount}</Text></View>
      }
    </Pressable>
  )
}

// ─── Deck selector modal ───────────────────────────────────────────────────────

function DeckSelectorModal({ visible, onClose, decks, onSelectDeck }: {
  visible: boolean
  onClose: () => void
  decks: Deck[]
  onSelectDeck: (deckId: string) => void
}) {
  const decksWithCards = decks.filter(d => d.dueCount > 0)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dms.overlay}>
        <View style={dms.sheet}>
          <View style={dms.header}>
            <Text style={dms.title}>Choose a deck to study</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={dms.list}>
            {decksWithCards.length === 0 ? (
              <View style={dms.empty}>
                <Text style={dms.emptyText}>No cards due today</Text>
              </View>
            ) : (
              decksWithCards.map(deck => (
                <TouchableOpacity
                  key={deck.id}
                  style={dms.deckOption}
                  onPress={() => {
                    onSelectDeck(deck.id)
                    onClose()
                  }}
                >
                  <View style={dms.deckInfo}>
                    <Text style={dms.deckEmoji}>{deck.emoji ?? '📚'}</Text>
                    <View style={dms.deckDetails}>
                      <Text style={dms.deckName}>{deck.name}</Text>
                      <Text style={dms.deckMeta}>
                        {(() => {
                          const review = deck.dueCount - deck.newCount
                          const parts: string[] = []
                          if (review > 0) parts.push(`${review} review`)
                          if (deck.newCount > 0) parts.push(`${deck.newCount} new`)
                          parts.push(`~${Math.max(1, Math.round((deck.dueCount * 35) / 60))} min`)
                          return parts.join(' · ')
                        })()}
                      </Text>
                    </View>
                  </View>
                  <View style={dms.dueBadge}>
                    <Text style={dms.dueBadgeText}>{deck.dueCount}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ─── Home screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { db }  = useDatabase()
  const router  = useRouter()

  const [decks,        setDecks]        = useState<Deck[]>([])
  const [totalDue,     setTotalDue]     = useState(0)
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeckSelector, setShowDeckSelector] = useState(false)

  const load = useCallback(async () => {
    // Repair streak first so all subsequent reads see the correct value
    await repairStreak(db)
    const [d, due, p, unread] = await Promise.all([
      getDecks(db), getTotalDueCount(db), getProfile(db), getUnreadNotificationCount(db),
    ])
    setDecks(d); setTotalDue(due); setProfile(p); setUnreadCount(unread)

    // Re-schedule the streak reminder based on latest study status
    if (p) scheduleStreakReminder(p).catch(() => {})
  }, [db])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  const handleCreate = async (name: string, sourceLanguage: string, targetLanguage: string, emoji: string) => {
    setShowModal(false)
    await createDeck(db, { name, sourceLanguage, targetLanguage, emoji })
    await load()
  }

  const handleLongPress = (deck: Deck) => {
    const doArchive = async () => { await archiveDeck(db, deck.id); await load() }
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Archive "${deck.name}"?`)) doArchive()
    } else {
      Alert.alert(deck.name, 'Manage deck', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: doArchive },
      ])
    }
  }

  const handleSettings = (action: string) => {
    if (action === 'profile')  router.push('/(tabs)/profile')
    if (action === 'new-deck') setShowModal(true)
    if (action === 'sort')     setDecks(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const streak   = profile?.currentStreak ?? 0
  const xp       = profile?.totalXp ?? 0
  const xpLabel  = xp >= 1000 ? `${(xp / 1000).toFixed(1)}k` : String(xp)

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={decks}
        keyExtractor={(d) => d.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.default} />
        }
        ListHeaderComponent={<>

          {/* ── Nav bar ─────────────────────────────────────────────── */}
          <View style={s.navBar}>

            {/* Left: streak + XP pills */}
            <View style={s.navLeft}>
              <TouchableOpacity style={s.streakPill} onPress={() => router.push('/streak')} activeOpacity={0.75}>
                <Ionicons name="flame" size={14} color={Colors.streak.text} />
                <Text style={s.streakPillText}>{streak}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.xpPill} onPress={() => router.push('/xp')} activeOpacity={0.75}>
                <Ionicons name="star-outline" size={13} color={Colors.accent.default} />
                <Text style={s.xpPillText}>{xpLabel}</Text>
              </TouchableOpacity>
            </View>


            {/* Center: WordFlip logo */}
            <View style={s.navCenter}>
              <Text style={s.logo}>
                Word<Text style={s.logoAccent}>Flip</Text>
              </Text>
            </View>

            {/* Right: bell + settings */}
            <View style={s.navRight}>
              <TouchableOpacity
                style={s.headerBtn}
                onPress={() => { setUnreadCount(0); router.push('/notifications') }}
              >
                <Ionicons name="notifications-outline" size={18} color={Colors.text.secondary} />
                {unreadCount > 0 && (
                  <View style={s.bellBadge}>
                    <Text style={s.bellBadgeText}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.headerBtn} onPress={() => setShowSettings(true)}>
                <Ionicons name="settings-outline" size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Greeting ────────────────────────────────────────────── */}
          <View style={s.greetingWrap}>
            <Text style={s.greeting}>{greeting}</Text>
          </View>

          {/* ── Session card ─────────────────────────────────────────── */}
          <View style={s.sessionCard}>
            <View>
              <Text style={s.sessionLabel}>Today's session</Text>
              <View style={s.sessionRow}>
                <Text style={s.sessionCount}>{totalDue}</Text>
                <Text style={s.sessionSub}> cards due</Text>
              </View>
              <Text style={s.sessionMeta}>~{estimateMinutes(totalDue)} min</Text>
            </View>
            <TouchableOpacity
              style={[s.playBtn, totalDue === 0 && s.playBtnDisabled]}
              onPress={() => setShowDeckSelector(true)}
              disabled={totalDue === 0}
            >
              <Ionicons name="play" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ── Section header ───────────────────────────────────────── */}
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>MY DECKS</Text>
          </View>
        </>}

        renderItem={({ item }) => (
          <DeckRow
            deck={item}
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
            onLongPress={() => handleLongPress(item)}
          />
        )}

        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
            <Text style={s.emptyTitle}>No decks yet</Text>
            <Text style={s.emptyDesc}>Tap + to create your first deck.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Create a deck</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <NewDeckModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreate}
      />

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onAction={handleSettings}
      />

      <DeckSelectorModal
        visible={showDeckSelector}
        onClose={() => setShowDeckSelector(false)}
        decks={decks}
        onSelectDeck={(deckId) => router.push({ pathname: '/(tabs)/study', params: { deckId } })}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 16, paddingBottom: 110 },

  // ── Nav bar ──
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    height: 44,
  },
  navLeft:  { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
  navCenter:{ flex: 1, alignItems: 'center' },
  navRight: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-end' },

  // Streak pill
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.streak.bg,
    borderWidth: 0.5, borderColor: Colors.streak.border,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  streakPillText: { fontSize: 13, fontWeight: '500', color: Colors.streak.text },

  // XP pill
  xpPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent.dim,
    borderWidth: 0.5, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  xpPillText: { fontSize: 13, fontWeight: '700', color: Colors.accent.default },

  // Logo
  logo:       { fontSize: 26, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.3 },
  logoAccent: { color: Colors.accent.default },

  // Header icon buttons (bell + settings)
  headerBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.accent.default,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },

  // ── Greeting ──
  greetingWrap: { marginBottom: 16 },
  greeting:     { fontSize: 20, fontWeight: '500', color: Colors.text.primary },

  // ── Session card ──
  sessionCard: {
    backgroundColor: Colors.bg.surface, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
  },
  sessionLabel: { fontSize: 12, color: Colors.text.muted, marginBottom: 4 },
  sessionRow:   { flexDirection: 'row', alignItems: 'baseline' },
  sessionCount: { fontSize: 28, fontWeight: '500', color: Colors.text.primary },
  sessionSub:   { fontSize: 14, color: Colors.text.muted },
  sessionMeta:  { fontSize: 12, color: Colors.accent.default, marginTop: 3 },
  playBtn: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: Colors.accent.default,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtnDisabled: { opacity: 0.4 },

  // ── Section header ──
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06 },

  // ── Deck rows ──
  deckRow: {
    backgroundColor: Colors.bg.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  deckRowDone: { opacity: 0.45 },
  deckIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  deckName: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  deckMeta: { fontSize: 11, color: Colors.text.muted, marginTop: 2 },
  duePill: {
    backgroundColor: Colors.semantic.successDim,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3,
  },
  duePillText: { fontSize: 12, fontWeight: '500', color: Colors.semantic.success },
  doneBadge:   { fontSize: 11, color: Colors.text.faint },

  // ── Empty state ──
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: Colors.text.primary, marginBottom: 6 },
  emptyDesc:  { fontSize: 14, color: Colors.text.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 20, backgroundColor: Colors.accent.default,
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10,
  },

  // ── FAB ──
  fab: {
    position: 'absolute', bottom: 90, right: 20,
    width: 54, height: 54, borderRadius: 18,
    backgroundColor: Colors.accent.default,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent.default,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  // ── Modals ──
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    padding: 24, paddingBottom: 40,
  },
  sheetTitle:  { fontSize: 18, fontWeight: '500', color: Colors.text.primary, marginBottom: 20 },
  inputLabel:  { fontSize: 12, color: Colors.text.muted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.bg.input, borderRadius: 10,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 12, fontSize: 15, color: Colors.text.primary,
    marginBottom: 4,
  },
  langButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bg.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 12, paddingVertical: 12,
    marginBottom: 4,
  },
  langButtonText: { fontSize: 15, color: Colors.text.primary, fontWeight: '500' },
  emojiDisplay: { fontSize: 20, fontWeight: '500' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, padding: 13, borderRadius: 12,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center',
  },
  saveBtn: { flex: 2, padding: 13, borderRadius: 12, backgroundColor: Colors.accent.default, alignItems: 'center' },

  // Settings modal rows
  settingsSectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.text.muted,
    letterSpacing: 0.06, marginBottom: 8,
  },
  settingsGroup: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  settingsIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.bg.elevated, borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: 15, color: Colors.text.primary },
})

// ─── Deck selector modal styles ──────────────────────────────────────────────

const dms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    paddingHorizontal: 20, paddingBottom: 40,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  title: { fontSize: 18, fontWeight: '500', color: Colors.text.primary },
  list: { maxHeight: 400, paddingVertical: 12 },
  deckOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  deckInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  deckEmoji: { fontSize: 24 },
  deckDetails: { flex: 1 },
  deckName: { fontSize: 15, fontWeight: '500', color: Colors.text.primary, marginBottom: 2 },
  deckMeta: { fontSize: 12, color: Colors.text.muted },
  dueBadge: {
    backgroundColor: Colors.semantic.successDim,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  dueBadgeText: { fontSize: 13, fontWeight: '500', color: Colors.semantic.success },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: Colors.text.muted },
})