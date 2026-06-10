/**
 * app/deck/[id]/settings.tsx — Edit deck settings
 *
 * Allows editing:
 *  - Deck name
 *  - Emoji icon
 *  - Source language (what you know)
 *  - Target language (what you're learning)
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase } from '../../../src/context/DatabaseContext'
import { getDeck, updateDeck, archiveDeck } from '../../../src/db/queries'
import type { Deck } from '../../../src/db/schema'
import { Colors } from '../../../src/theme/colors'

// Common language codes and names
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

// Flattened emoji list for quick access
const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat()

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ visible, onClose, onSelect }: {
  visible: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = search.trim() === ''
    ? ALL_EMOJIS
    : ALL_EMOJIS.filter(e => e.includes(search))

  if (!visible) return null

  return (
    <View style={ep.overlay}>
      <View style={ep.container}>
        <View style={ep.header}>
          <Text style={ep.title}>Choose emoji</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <View style={ep.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.text.faint} style={ep.searchIcon} />
          <TextInput
            style={ep.searchInput}
            placeholder="Search emoji..."
            placeholderTextColor={Colors.text.faint}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        <ScrollView style={ep.emojiGrid} showsVerticalScrollIndicator={false}>
          {search.trim() === '' ? (
            // Show categories
            Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <View key={category}>
                <Text style={ep.categoryLabel}>{category}</Text>
                <View style={ep.grid}>
                  {emojis.map((emoji, i) => (
                    <TouchableOpacity
                      key={i}
                      style={ep.emojiBtn}
                      onPress={() => {
                        onSelect(emoji)
                        onClose()
                      }}
                    >
                      <Text style={ep.emojiBtnText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          ) : (
            // Show filtered results
            <View>
              <View style={ep.grid}>
                {filtered.map((emoji, i) => (
                  <TouchableOpacity
                    key={i}
                    style={ep.emojiBtn}
                    onPress={() => {
                      onSelect(emoji)
                      onClose()
                    }}
                  >
                    <Text style={ep.emojiBtnText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {filtered.length === 0 && (
                <Text style={ep.noResults}>No emoji found</Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}

const ep = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.bg.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: '75%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  title: { fontSize: 16, fontWeight: '600', color: Colors.text.primary },
  searchWrap: {
    position: 'relative',
    marginHorizontal: 16, marginVertical: 12,
  },
  searchIcon: {
    position: 'absolute', left: 12, top: 12, zIndex: 1,
  },
  searchInput: {
    backgroundColor: Colors.bg.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 40, paddingVertical: 10,
    color: Colors.text.primary, fontSize: 14,
  },
  emojiGrid: {
    flex: 1, paddingHorizontal: 8,
  },
  categoryLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.text.muted,
    letterSpacing: 0.5, marginTop: 8, marginBottom: 6, textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 2,
  },
  emojiBtn: {
    width: '12.5%', aspectRatio: 1, borderRadius: 6,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 18 },
  noResults: {
    textAlign: 'center', paddingVertical: 40,
    color: Colors.text.muted, fontSize: 14,
  },
})

// ─── Language picker ──────────────────────────────────────────────────────────

function LanguagePicker({ visible, onClose, onSelect, title }: {
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
    <View style={lp.overlay}>
      <View style={lp.container}>
        <View style={lp.header}>
          <Text style={lp.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={lp.searchInput}
          placeholder="Search language..."
          placeholderTextColor={Colors.text.faint}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />

        <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={lp.langRow}
              onPress={() => {
                onSelect(lang.code)
                onClose()
              }}
            >
              <Text style={lp.langName}>{lang.name}</Text>
              <Text style={lp.langCode}>{lang.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

const lp = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.bg.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: '70%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  title: { fontSize: 16, fontWeight: '600', color: Colors.text.primary },
  searchInput: {
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: Colors.bg.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 10,
    color: Colors.text.primary, fontSize: 14,
  },
  langRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  langName: { fontSize: 15, color: Colors.text.primary },
  langCode: { fontSize: 12, color: Colors.text.muted, fontWeight: '500' },
})

// ─── Main settings screen ──────────────────────────────────────────────────────

export default function DeckSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { db } = useDatabase()
  const router = useRouter()

  const [deck, setDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('')
  const [newCardLimit,      setNewCardLimit]      = useState('40')
  const [writingExercises, setWritingExercises] = useState(false)
  const [voiceExercises,   setVoiceExercises]   = useState(false)

  const [showSourceLangPicker, setShowSourceLangPicker] = useState(false)
  const [showTargetLangPicker, setShowTargetLangPicker] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const d = await getDeck(db, id)
    if (d) {
      setDeck(d)
      setName(d.name)
      setEmoji(d.emoji || '')
      setSourceLanguage(d.sourceLanguage || 'en')
      setTargetLanguage(d.targetLanguage || '')
      setNewCardLimit(String(d.newCardLimit ?? 40))
      setWritingExercises(d.writingExercises ?? false)
      setVoiceExercises(d.voiceExercises ?? false)
    }
  }, [db, id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Deck name cannot be empty')
      return
    }
    if (!targetLanguage.trim()) {
      Alert.alert('Error', 'Target language is required')
      return
    }

    const limit = parseInt(newCardLimit, 10)
    if (isNaN(limit) || limit < 1) {
      Alert.alert('Error', 'Daily new cards must be at least 1')
      return
    }

    setSaving(true)
    try {
      await updateDeck(db, id as string, {
        name: name.trim(),
        emoji: emoji.trim() || null,
        newCardLimit: limit,
        writingExercises,
        voiceExercises,
      })

      Alert.alert('Success', 'Deck updated', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e) {
      Alert.alert('Error', 'Failed to save changes')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = () => {
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Archive "${deck.name}"?`)) {
        archiveDeck(db, id as string).then(() => router.replace('/(tabs)'))
      }
    } else {
      Alert.alert('Archive deck', `Archive "${deck.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            archiveDeck(db, id as string).then(() => router.replace('/(tabs)'))
          },
        },
      ])
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.accent.default} size="large" />
      </View>
    )
  }

  if (!deck) {
    return (
      <View style={s.center}>
        <Text style={{ color: Colors.text.muted }}>Deck not found</Text>
      </View>
    )
  }

  const getLangName = (code: string) => {
    const lang = LANGUAGE_CODES.find(l => l.code === code)
    return lang ? lang.name : code.toUpperCase()
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Deck</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Deck name ─────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Deck name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Deutsch A1"
            placeholderTextColor={Colors.text.faint}
            value={name}
            onChangeText={setName}
            editable={!saving}
          />
        </View>

        {/* ── Emoji icon ────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Icon emoji</Text>
          <TouchableOpacity
            style={s.langSelectBtn}
            onPress={() => setShowEmojiPicker(true)}
            disabled={saving}
          >
            <Text style={s.emojiDisplayText}>{emoji || '📚'}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>
          <Text style={s.langHint}>Tap to choose an emoji icon</Text>
        </View>

        {/* ── Source language ───────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Source language (you know)</Text>
          <TouchableOpacity
            style={s.langSelectBtn}
            onPress={() => setShowSourceLangPicker(true)}
            disabled={saving}
          >
            <Text style={s.langSelectText}>{getLangName(sourceLanguage)}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>
          <Text style={s.langHint}>Language of translations and explanations</Text>
        </View>

        {/* ── Target language ───────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Target language (learning)</Text>
          <TouchableOpacity
            style={s.langSelectBtn}
            onPress={() => setShowTargetLangPicker(true)}
            disabled={saving}
          >
            <Text style={s.langSelectText}>{getLangName(targetLanguage)}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>
          <Text style={s.langHint}>Language of cards you're learning</Text>
        </View>

        {/* ── Daily new cards limit ────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Daily new cards</Text>
          <TextInput
            style={s.input}
            placeholder="40"
            placeholderTextColor={Colors.text.faint}
            value={newCardLimit}
            onChangeText={setNewCardLimit}
            keyboardType="number-pad"
            editable={!saving}
          />
          <Text style={s.langHint}>Maximum new cards to study per day</Text>
        </View>

        {/* ── Study modes ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.label}>Study modes</Text>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleTitle}>Writing exercises</Text>
              <Text style={s.langHint}>Type the word from memory after each flashcard session</Text>
            </View>
            <Switch
              value={writingExercises}
              onValueChange={setWritingExercises}
              disabled={saving}
              trackColor={{ false: Colors.border.default, true: Colors.accent.default }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={[s.toggleRow, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleTitle}>Voice exercises</Text>
              <Text style={s.langHint}>Say the word out loud — speech recognition checks your answer</Text>
            </View>
            <Switch
              value={voiceExercises}
              onValueChange={setVoiceExercises}
              disabled={saving}
              trackColor={{ false: Colors.border.default, true: Colors.accent.default }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* ── Preview ───────────────────────────────────────────────────── */}
        <View style={s.previewCard}>
          <Text style={s.previewLabel}>Preview</Text>
          <View style={s.previewContent}>
            <Text style={s.previewEmoji}>{emoji || '📚'}</Text>
            <View>
              <Text style={s.previewName}>{name || 'Deck name'}</Text>
              <Text style={s.previewMeta}>
                {getLangName(sourceLanguage)} → {getLangName(targetLanguage)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveBtnText}>
            {saving ? 'Saving...' : 'Save changes'}
          </Text>
        </TouchableOpacity>

        {/* ── Archive button ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.archiveBtn}
          onPress={handleArchive}
          disabled={saving}
        >
          <Ionicons name="archive-outline" size={18} color={Colors.semantic.error} />
          <Text style={s.archiveBtnText}>Archive deck</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Language pickers */}
      <LanguagePicker
        visible={showSourceLangPicker}
        onClose={() => setShowSourceLangPicker(false)}
        onSelect={setSourceLanguage}
        title="Select source language"
      />
      <LanguagePicker
        visible={showTargetLangPicker}
        onClose={() => setShowTargetLangPicker(false)}
        onSelect={setTargetLanguage}
        title="Select target language"
      />

      {/* Emoji picker */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={setEmoji}
      />

    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 80 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '500', color: Colors.text.primary },

  section: { marginBottom: 24 },
  label: {
    fontSize: 12, fontWeight: '600', color: Colors.text.muted,
    letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase',
  },

  input: {
    backgroundColor: Colors.bg.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text.primary,
    marginBottom: 6,
  },

  langSelectBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bg.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 6,
  },
  langSelectText: { fontSize: 15, color: Colors.text.primary, fontWeight: '500' },
  emojiDisplayText: { fontSize: 24, fontWeight: '500' },
  langHint: { fontSize: 12, color: Colors.text.faint, marginTop: 4 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  toggleTitle: { fontSize: 15, color: Colors.text.primary, fontWeight: '500', marginBottom: 2 },

  previewCard: {
    backgroundColor: Colors.bg.surface, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 16, marginBottom: 24,
  },
  previewLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.text.muted,
    letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase',
  },
  previewContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewEmoji: { fontSize: 40 },
  previewName: { fontSize: 16, fontWeight: '600', color: Colors.text.primary, marginBottom: 2 },
  previewMeta: { fontSize: 13, color: Colors.text.muted },

  saveBtn: {
    backgroundColor: Colors.accent.default, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  archiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12,
    borderWidth: 0.5, borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 12, gap: 8, marginTop: 12,
  },
  archiveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.semantic.error },
})
