/**
 * app/deck/[id]/index.tsx — Deck detail  (Design A)
 *
 * Bold due count · segmented progress bar · compact card rows
 * with type pill, reversed badge, state dot, and action buttons.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Pressable, Alert, Modal, TextInput, ScrollView,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase }                                         from '../../../src/context/DatabaseContext'
import { getDeck, getCards, deleteCard, getDeckStats, getProfile, searchCards } from '../../../src/db/queries'
import type { Deck, Card }                                     from '../../../src/db/schema'
import type { DeckStats }                                      from '../../../src/db/queries'
import { Colors, posColor }                                    from '../../../src/theme/colors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateDot(state?: number) {
  if (state === 2) return Colors.accent.default        // mastered (review)
  if (state === 1 || state === 3) return Colors.semantic.success  // learning / relearning
  return 'rgba(255,255,255,0.22)'                      // new
}

function stateLabel(state?: number): string {
  if (state === 2) return 'mastered'
  if (state === 1 || state === 3) return 'learning'
  return 'new'
}

function estMins(dueCount: number) {
  return Math.max(1, Math.round((dueCount * 35) / 60))
}

// ─── Segmented progress bar ───────────────────────────────────────────────────

function ProgressBar({ stats }: { stats: DeckStats | null }) {
  if (!stats || stats.total === 0) return null
  const { total, newCards, learning, review } = stats
  const newPct   = (newCards / total) * 100
  const learnPct = (learning / total) * 100
  const mastPct  = (review   / total) * 100

  return (
    <View style={s.progressWrap}>
      <View style={s.progressTrack}>
        {newPct   > 0 && <View style={[s.seg, { flex: newPct,   backgroundColor: 'rgba(255,255,255,0.22)' }]} />}
        {learnPct > 0 && <View style={[s.seg, { flex: learnPct, backgroundColor: Colors.semantic.success }]} />}
        {mastPct  > 0 && <View style={[s.seg, { flex: mastPct,  backgroundColor: Colors.accent.default }]} />}
      </View>
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: 'rgba(255,255,255,0.22)' }]} />
          <Text style={s.legendText}>{newCards} not studied</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: Colors.semantic.success }]} />
          <Text style={s.legendText}>{learning} learning</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: Colors.accent.default }]} />
          <Text style={s.legendText}>{review} mastered</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Search modal ─────────────────────────────────────────────────────────────

function SearchModal({ visible, onClose, onSearch, results }: {
  visible: boolean
  onClose: () => void
  onSearch: (query: string) => void
  results: CardWithState[]
}) {
  const [query, setQuery] = useState('')

  const handleClose = () => {
    setQuery('')
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={s.searchModal}>
        <View style={s.searchHeader}>
          <View style={s.searchInputWrap}>
            <Ionicons name="search" size={16} color={Colors.text.faint} style={s.searchInputIcon} />
            <TextInput
              style={s.searchInputField}
              placeholder="Find by front, back, or notes..."
              placeholderTextColor={Colors.text.faint}
              value={query}
              onChangeText={(text) => {
                setQuery(text)
                onSearch(text)
              }}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); onSearch('') }}>
                <Ionicons name="close-circle" size={18} color={Colors.text.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Text style={s.searchCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.searchResults} showsVerticalScrollIndicator={false}>
          {results.length === 0 && query.length > 0 ? (
            <View style={s.searchEmpty}>
              <Text style={s.searchEmptyText}>No cards found</Text>
            </View>
          ) : (
            results.map(card => (
              <View key={card.id} style={s.searchResultRow}>
                <View style={s.searchResultContent}>
                  <Text style={s.searchResultFront} numberOfLines={1}>{card.front}</Text>
                  <Text style={s.searchResultBack} numberOfLines={1}>{card.back}</Text>
                  {card.notes && <Text style={s.searchResultNotes} numberOfLines={1}>📝 {card.notes}</Text>}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Card row ─────────────────────────────────────────────────────────────────

type CardWithState = Card & { fsrsState?: number }

function CardRow({ card, onDelete, onEdit }: {
  card:     CardWithState
  onDelete: (id: string) => void
  onEdit:   (id: string) => void
}) {
  const pill = posColor(card.cardType)
  const dot  = stateDot(card.fsrsState)
  const label = stateLabel(card.fsrsState)

  const confirmDelete = () => {
    if (typeof window !== 'undefined' && window.confirm) {
      // Web — use browser confirm dialog
      if (window.confirm(`Delete "${card.front}"? This cannot be undone.`)) {
        onDelete(card.id)
      }
    } else {
      // Native — use Alert
      Alert.alert('Delete card', `Delete "${card.front}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(card.id) },
      ])
    }
  }

  return (
    <Pressable
      style={s.cardRow}
      onLongPress={confirmDelete}
      android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
    >
      {/* Left — badges + word + translation */}
      <View style={s.cardContent}>
        <View style={s.badgeRow}>
          {card.studyBothDirections && (
            <View style={s.reversedBadge}>
              <Text style={s.reversedBadgeText}>↩ reversed</Text>
            </View>
          )}
          <View style={[s.typePill, { backgroundColor: pill.bg }]}>
            <Text style={[s.typePillText, { color: pill.text }]}>{card.cardType}</Text>
          </View>
        </View>
        <Text style={s.cardFront} numberOfLines={1}>{card.front}</Text>
        <Text style={s.cardBack}  numberOfLines={1}>{card.back}</Text>
      </View>

      {/* Right — state dot + actions */}
      <View style={s.cardRight}>
        <View style={[s.stateDot, { backgroundColor: dot }]} />
        <View style={s.cardActions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(card.id)}>
            <Ionicons name="pencil-outline" size={14} color={Colors.text.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={14} color={Colors.semantic.error} />
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { db } = useDatabase()
  const router = useRouter()

  const [deck,    setDeck]    = useState<Deck | null>(null)
  const [cards,   setCards]   = useState<CardWithState[]>([])
  const [stats,   setStats]   = useState<DeckStats | null>(null)
  const [streak,  setStreak]  = useState(0)
  const [xpToday, setXpToday] = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [sortOrder,  setSortOrder]  = useState<'newest'|'oldest'>('newest')
  const [filterState, setFilterState] = useState<'all'|'not_studied'|'learning'|'mastered'>('all')
  const [filterType,  setFilterType]  = useState<'all'|string>('all')
  const [showFilter,  setShowFilter]  = useState(false)
  const [showSearch,  setShowSearch]  = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CardWithState[]>([])

  const load = useCallback(async () => {
    if (!id) return
    const [d, rawCards, st, profile] = await Promise.all([
      getDeck(db, id),
      getCards(db, id),
      getDeckStats(db, id),
      getProfile(db),
    ])

    // Attach fsrs state to each card for the state dot
    let cardsWithState: CardWithState[] = rawCards
    try {
      const fsrsRows = await db.getAllAsync<{ card_id: string; state: number }>(
        `SELECT card_id, state FROM fsrs_state WHERE card_id IN (${rawCards.map(() => '?').join(',')})`,
        rawCards.map(c => c.id) as any[]
      )
      const stateMap: Record<string, number> = {}
      fsrsRows.forEach(r => { stateMap[r.card_id] = r.state })
      cardsWithState = rawCards.map(c => ({ ...c, fsrsState: stateMap[c.id] }))
    } catch {}

    setDeck(d)
    setCards(cardsWithState)
    setStats(st)
    setStreak(profile?.currentStreak ?? 0)
    // Approximate XP earned today based on daily reviews
    setXpToday((profile?.dailyReviewsCount ?? 0) * 15)
  }, [db, id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const handleDelete = useCallback(async (cardId: string) => {
    await deleteCard(db, cardId)
    await load()
  }, [db, load])

  const handleEdit   = (cardId: string) =>
    router.push({ pathname: '/deck/[id]/edit-card', params: { id, cardId } })

  const handleStudy  = () =>
    router.push({ pathname: '/(tabs)/study', params: { deckId: id } })

  const handleStudyWriting = () =>
    router.push({ pathname: '/(tabs)/study', params: { deckId: id, mode: 'writing' } })

  const handleStudyVoice = () =>
    router.push({ pathname: '/(tabs)/study', params: { deckId: id, mode: 'voice' } })

  const handleAddCard = () =>
    router.push({ pathname: '/deck/[id]/add-card', params: { id } })

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const rawResults = await searchCards(db, id!, query.trim())
    let resultsWithState: CardWithState[] = rawResults
    try {
      const fsrsRows = await db.getAllAsync<{ card_id: string; state: number }>(
        `SELECT card_id, state FROM fsrs_state WHERE card_id IN (${rawResults.map(() => '?').join(',')})`,
        rawResults.map(c => c.id) as any[]
      )
      const stateMap: Record<string, number> = {}
      fsrsRows.forEach(r => { stateMap[r.card_id] = r.state })
      resultsWithState = rawResults.map(c => ({ ...c, fsrsState: stateMap[c.id] }))
    } catch {}
    setSearchResults(resultsWithState)
  }, [db, id])

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.accent.default} size="large" /></View>
  }
  if (!deck) {
    return <View style={s.center}><Text style={{ color: Colors.text.muted }}>Deck not found.</Text></View>
  }

  const retention = stats && stats.total > 0 ? Math.round(stats.retention * 100) : null
  const mins      = estMins(deck.dueCount)

  // Sort
  const sortedCards = [...cards].sort((a, b) =>
    sortOrder === 'newest'
      ? b.createdAt - a.createdAt
      : a.createdAt - b.createdAt
  )

  // Filter by learning state
  const stateFiltered = sortedCards.filter(c => {
    if (filterState === 'all') return true
    if (filterState === 'not_studied') return !c.fsrsState || c.fsrsState === 0
    if (filterState === 'learning')    return c.fsrsState === 1 || c.fsrsState === 3
    if (filterState === 'mastered')    return c.fsrsState === 2
    return true
  })

  // Filter by card type
  const filteredCards = stateFiltered.filter(c =>
    filterType === 'all' || c.cardType === filterType
  )

  // All unique card types for the filter sheet
  const cardTypes = Array.from(new Set(cards.map(c => c.cardType)))

  const activeFilterCount =
    (filterState !== 'all' ? 1 : 0) + (filterType !== 'all' ? 1 : 0)

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filteredCards}
        keyExtractor={c => c.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}

        ListHeaderComponent={<>

          {/* ── Top bar ──────────────────────────────────────────────── */}
          <View style={s.topBar}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.replace('/(tabs)')}>
              <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={s.topRight}>
              <TouchableOpacity style={s.iconBtn} onPress={() => setShowSearch(true)}>
                <Ionicons name="search-outline" size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
<TouchableOpacity
                style={s.iconBtn}
                onPress={() => router.push({ pathname: '/deck/[id]/settings', params: { id } })}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Deck name + meta ─────────────────────────────────────── */}
          <View style={s.deckHeader}>
            <Text style={s.deckName}>{deck.name}</Text>
            <Text style={s.deckMeta}>
              Spaced repetition
              {deck.targetLanguage ? ` · ${deck.targetLanguage.toUpperCase()}` : ''}
              {' · '}{cards.length} cards
            </Text>
          </View>

          {/* ── Big stats card ───────────────────────────────────────── */}
          <View style={s.statsCard}>

            {/* Top row: due count + right info */}
            <View style={s.statsTop}>
              <View>
                <Text style={s.dueNum}>{deck.dueCount}</Text>
                <Text style={s.dueLabel}>
                  {deck.newCount > 0
                    ? `${deck.dueCount - deck.newCount} review · ${deck.newCount} new`
                    : 'cards due today'
                  }
                </Text>
              </View>
              <View style={s.statsRight}>
                {xpToday > 0 && (
                  <Text style={s.xpText}>+{xpToday} XP today</Text>
                )}
                {streak > 0 && (
                  <Text style={s.streakText}>🔥 {streak} day streak</Text>
                )}
                {retention !== null && (
                  <Text style={s.retText}>{retention}% retention</Text>
                )}
                <Text style={s.estText}>~{mins} min</Text>
              </View>
            </View>

            {/* Segmented progress bar */}
            <ProgressBar stats={stats} />

            {/* Study button */}
            <TouchableOpacity
              style={[s.studyBtn, deck.dueCount === 0 && s.studyBtnDone]}
              onPress={handleStudy}
              disabled={deck.dueCount === 0}
              activeOpacity={0.82}
            >
              <Text style={[s.studyBtnText, deck.dueCount === 0 && s.studyBtnTextDone]}>
                {deck.dueCount === 0 ? 'All caught up today 🎉' : `Study ${deck.dueCount} cards`}
              </Text>
            </TouchableOpacity>

            {/* Practice mode buttons */}
            <View style={s.practiceRow}>
              <TouchableOpacity
                style={s.practiceBtn}
                onPress={handleStudyWriting}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil-outline" size={15} color={Colors.accent.default} />
                <Text style={s.practiceBtnText}>Study Writing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.practiceBtn}
                onPress={handleStudyVoice}
                activeOpacity={0.8}
              >
                <Ionicons name="mic-outline" size={15} color={Colors.accent.default} />
                <Text style={s.practiceBtnText}>Study Pronunciation</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Sort + Filter bar ───────────────────────────────────── */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>
              ALL CARDS ({filteredCards.length}{filteredCards.length !== cards.length ? ` of ${cards.length}` : ''})
            </Text>
            <View style={s.sortFilterRow}>
              {/* Sort toggle */}
              <TouchableOpacity
                style={s.sortBtn}
                onPress={() => setSortOrder(o => o === 'newest' ? 'oldest' : 'newest')}
              >
                <Ionicons name="swap-vertical-outline" size={13} color={Colors.text.muted} />
                <Text style={s.sortBtnText}>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</Text>
              </TouchableOpacity>

              {/* Filter button */}
              <TouchableOpacity
                style={[s.filterBtn, activeFilterCount > 0 && s.filterBtnActive]}
                onPress={() => setShowFilter(true)}
              >
                <Ionicons name="options-outline" size={13} color={activeFilterCount > 0 ? Colors.accent.default : Colors.text.muted} />
                <Text style={[s.filterBtnText, activeFilterCount > 0 && { color: Colors.accent.default }]}>
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>}

        renderItem={({ item }) => (
          <CardRow card={item} onDelete={handleDelete} onEdit={handleEdit} />
        )}

        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 44, marginBottom: 14 }}>🃏</Text>
            <Text style={s.emptyTitle}>No cards yet</Text>
            <Text style={s.emptyDesc}>Add your first card to start studying.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={handleAddCard}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.emptyBtnText}>Add first card</Text>
            </TouchableOpacity>
          </View>
        }

        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {/* ── Search modal ─────────────────────────────────────────────── */}
      <SearchModal visible={showSearch} onClose={() => setShowSearch(false)} onSearch={handleSearch} results={searchResults} />

      {/* ── Filter bottom sheet ──────────────────────────────────── */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowFilter(false)}>
          <Pressable style={s.filterSheet} onPress={e => e.stopPropagation()}>
            <Text style={s.filterSheetTitle}>Filter cards</Text>

            <Text style={s.filterGroupLabel}>LEARNING STATUS</Text>
            <View style={s.filterPillRow}>
              {(['all','not_studied','learning','mastered'] as const).map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.filterPill, filterState === v && s.filterPillActive]}
                  onPress={() => setFilterState(v)}
                >
                  <Text style={[s.filterPillText, filterState === v && s.filterPillTextActive]}>
                    {v === 'all' ? 'All' : v === 'not_studied' ? 'Not studied' : v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.filterGroupLabel, { marginTop: 16 }]}>CARD TYPE</Text>
            <View style={s.filterPillRow}>
              <TouchableOpacity
                style={[s.filterPill, filterType === 'all' && s.filterPillActive]}
                onPress={() => setFilterType('all')}
              >
                <Text style={[s.filterPillText, filterType === 'all' && s.filterPillTextActive]}>All</Text>
              </TouchableOpacity>
              {cardTypes.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.filterPill, filterType === type && s.filterPillActive]}
                  onPress={() => setFilterType(type)}
                >
                  <Text style={[s.filterPillText, filterType === type && s.filterPillTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.filterActions}>
              <TouchableOpacity
                style={s.filterClearBtn}
                onPress={() => { setFilterState('all'); setFilterType('all') }}
              >
                <Text style={s.filterClearBtnText}>Clear filters</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.filterDoneBtn} onPress={() => setShowFilter(false)}>
                <Text style={s.filterDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── FAB — Add card ───────────────────────────────────────────── */}
      <TouchableOpacity style={s.fab} onPress={handleAddCard} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 14, paddingBottom: 80 },

  // Top bar
  topBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  topRight: { flexDirection: 'row', gap: 8 },
  iconBtn:  {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },

  // Deck name
  deckHeader: { marginBottom: 14 },
  deckName:   { fontSize: 22, fontWeight: '500', color: Colors.text.primary, marginBottom: 3 },
  deckMeta:   { fontSize: 12, color: Colors.text.muted },

  // Stats card
  statsCard: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, marginBottom: 20,
  },
  statsTop:  {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  dueNum:    { fontSize: 44, fontWeight: '500', color: Colors.text.primary, lineHeight: 48 },
  dueLabel:  { fontSize: 12, color: Colors.text.muted, marginTop: 3 },
  statsRight:{ alignItems: 'flex-end', gap: 4, paddingTop: 4 },
  xpText:    { fontSize: 12, color: Colors.accent.default, fontWeight: '500' },
  streakText:{ fontSize: 12, color: Colors.streak.text, fontWeight: '500' },
  retText:   { fontSize: 11, color: Colors.semantic.success },
  estText:   { fontSize: 11, color: Colors.text.faint },

  // Progress bar
  progressWrap:  { marginBottom: 14 },
  progressTrack: {
    height: 5, borderRadius: 3, flexDirection: 'row',
    gap: 2, overflow: 'hidden', marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  seg:    { borderRadius: 2 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.text.muted },

  // Study button
  studyBtn: {
    backgroundColor: Colors.accent.default,
    borderRadius: 13, paddingVertical: 13, alignItems: 'center',
  },
  studyBtnDone:    { backgroundColor: Colors.bg.elevated },
  studyBtnText:    { fontSize: 15, fontWeight: '500', color: '#fff' },
  studyBtnTextDone:{ color: Colors.text.secondary },

  practiceRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  practiceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.accent.default,
    borderRadius: 13, paddingVertical: 11,
    backgroundColor: Colors.accent.dim,
  },
  practiceBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent.default },

  // Section header
  sectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:     { fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06 },
  addInlineBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addInlineBtnText: { fontSize: 12, fontWeight: '500', color: Colors.accent.default },

  // Card rows
  cardRow: {
    backgroundColor: Colors.bg.surface,
    borderRadius: 13, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 12, flexDirection: 'row', alignItems: 'center',
    marginBottom: 6, gap: 10,
  },
  cardContent:    { flex: 1, minWidth: 0 },
  badgeRow:       { flexDirection: 'row', gap: 5, marginBottom: 4, flexWrap: 'wrap' },
  reversedBadge:  { backgroundColor: 'rgba(133,183,235,0.14)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  reversedBadgeText:{ fontSize: 9, fontWeight: '500', color: '#85B7EB' },
  typePill:       { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  typePillText:   { fontSize: 9, fontWeight: '500' },
  cardFront:      { fontSize: 15, fontWeight: '500', color: Colors.text.primary, marginBottom: 1 },
  cardBack:       { fontSize: 12, color: Colors.text.secondary },

  cardRight:      { alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  stateDot:       { width: 8, height: 8, borderRadius: 4 },
  cardActions:    { flexDirection: 'row', gap: 4 },
  actionBtn:      {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnRed:   { backgroundColor: 'rgba(240,149,149,0.1)' },

  // Empty
  empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 18, fontWeight: '500', color: Colors.text.primary, marginBottom: 8 },
  emptyDesc:   { fontSize: 14, color: Colors.text.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent.default, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  emptyBtnText:{ fontSize: 14, fontWeight: '500', color: '#fff' },

  // Sort + Filter bar
  sortFilterRow:   { flexDirection: 'row', gap: 6 },
  sortBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bg.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: Colors.border.default },
  sortBtnText:     { fontSize: 11, color: Colors.text.muted, fontWeight: '500' },
  filterBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bg.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: Colors.border.default },
  filterBtnActive: { borderColor: Colors.accent.default, backgroundColor: Colors.accent.glow },
  filterBtnText:   { fontSize: 11, color: Colors.text.muted, fontWeight: '500' },

  // Filter modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  filterSheet:     { backgroundColor: Colors.bg.elevated, borderRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 22, paddingBottom: 40 },
  filterSheetTitle:{ fontSize: 17, fontWeight: '500', color: Colors.text.primary, marginBottom: 18 },
  filterGroupLabel:{ fontSize: 11, fontWeight: '500', color: Colors.text.muted, letterSpacing: 0.06, marginBottom: 10 },
  filterPillRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default },
  filterPillActive:{ backgroundColor: Colors.accent.dim, borderColor: Colors.accent.default },
  filterPillText:  { fontSize: 13, color: Colors.text.secondary },
  filterPillTextActive: { color: Colors.accent.default, fontWeight: '500' },
  filterActions:   { flexDirection: 'row', gap: 10, marginTop: 24 },
  filterClearBtn:  { flex: 1, padding: 12, borderRadius: 12, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center' },
  filterClearBtnText: { fontSize: 14, color: Colors.text.secondary },
  filterDoneBtn:   { flex: 1, padding: 12, borderRadius: 12, backgroundColor: Colors.accent.default, alignItems: 'center' },
  filterDoneBtnText:  { fontSize: 14, fontWeight: '500', color: '#fff' },

  // Search modal
  searchModal:      { flex: 1, backgroundColor: Colors.bg.base },
  searchHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  searchInputWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.surface, borderRadius: 10, paddingHorizontal: 10, borderWidth: 0.5, borderColor: Colors.border.default },
  searchInputIcon:  { marginRight: 6 },
  searchInputField: { flex: 1, paddingVertical: 10, color: Colors.text.primary, fontSize: 14 },
  searchCancel:     { fontSize: 14, color: Colors.accent.default, fontWeight: '500' },
  searchResults:    { flex: 1 },
  searchResultRow:  { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle },
  searchResultContent:{ gap: 2 },
  searchResultFront: { fontSize: 15, fontWeight: '500', color: Colors.text.primary },
  searchResultBack:  { fontSize: 13, color: Colors.text.secondary },
  searchResultNotes: { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  searchEmpty:      { alignItems: 'center', paddingTop: 40 },
  searchEmptyText:  { fontSize: 14, color: Colors.text.muted },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: Colors.accent.default,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent.default,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
})