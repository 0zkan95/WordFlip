/**
 * app/deck/[id]/add-card.tsx — Add card screen
 * Voice recording for the front (target language) word only.
 * Recording is saved to voice_notes table after card creation.
 */

import React, { useCallback, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'

import { useDatabase }                    from '../../../src/context/DatabaseContext'
import { createCard, saveVoiceNote }      from '../../../src/db/queries'
import type { CardType }                  from '../../../src/db/schema'
import { Colors, posColor }              from '../../../src/theme/colors'

// ─── Card type selector ───────────────────────────────────────────────────────

const CARD_TYPES: CardType[] = ['noun', 'verb', 'adjective', 'phrase', 'other']

function TypeSelector({ value, onChange }: {
  value: CardType; onChange: (t: CardType) => void
}) {
  return (
    <View style={ts.row}>
      {CARD_TYPES.map((type) => {
        const pill   = posColor(type)
        const active = value === type
        return (
          <TouchableOpacity
            key={type}
            style={[ts.pill, active && { backgroundColor: pill.bg, borderColor: pill.text + '55' }]}
            onPress={() => onChange(type)}
          >
            <Text style={[ts.pillText, { color: active ? pill.text : Colors.text.muted }]}>
              {type}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const ts = StyleSheet.create({
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border.default, backgroundColor: Colors.bg.surface },
  pillText: { fontSize: 12, fontWeight: '500' },
})

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, sublabel }: {
  value: boolean; onChange: (v: boolean) => void; label: string; sublabel: string
}) {
  return (
    <TouchableOpacity
      style={[tg.row, value && tg.rowOn]}
      onPress={() => onChange(!value)}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={tg.label}>{label}</Text>
        <Text style={tg.sub}>{sublabel}</Text>
      </View>
      <View style={[tg.track, value && tg.trackOn]}>
        <View style={[tg.thumb, value && tg.thumbOn]} />
      </View>
    </TouchableOpacity>
  )
}

const tg = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.bg.surface, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border.default, padding: 14 },
  rowOn:   { borderColor: Colors.accent.default, backgroundColor: Colors.accent.glow },
  label:   { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  sub:     { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  track:   { width: 48, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: Colors.border.default, justifyContent: 'center', paddingHorizontal: 3 },
  trackOn: { backgroundColor: Colors.accent.default, borderColor: Colors.accent.default },
  thumb:   { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.4)' },
  thumbOn: { backgroundColor: '#fff', transform: [{ translateX: 20 }] },
})

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <View style={fl.wrap}>
      <View style={fl.labelRow}>
        <Text style={fl.label}>{label}</Text>
        {required && <Text style={fl.req}>required</Text>}
      </View>
      {children}
    </View>
  )
}

const fl = StyleSheet.create({
  wrap:     { marginBottom: 20 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label:    { fontSize: 13, fontWeight: '500', color: Colors.text.secondary },
  req:      { fontSize: 11, color: Colors.text.faint },
})

// ─── Voice recorder ───────────────────────────────────────────────────────────

type RecordState = 'idle' | 'recording' | 'recorded'

function VoiceRecorder({ onRecorded }: {
  onRecorded: (uri: string, durationMs: number) => void
}) {
  const recordingRef               = useRef<Audio.Recording | null>(null)
  const playbackRef                = useRef<Audio.Sound | null>(null)
  const recordStartRef             = useRef<number>(0)
  const [state,      setState]     = useState<RecordState>('idle')
  const [recordUri,  setRecordUri] = useState<string | null>(null)
  const [isPlaying,  setIsPlaying] = useState(false)
  const [durationMs, setDurationMs]= useState(0)

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Voice recording is only available on the mobile app.')
      return
    }
    try {
      const { granted } = await Audio.requestPermissionsAsync()
      if (!granted) {
        Alert.alert('Permission needed', 'Allow microphone access to record your pronunciation.')
        return
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      recordingRef.current = recording
      recordStartRef.current = Date.now()
      setState('recording')
    } catch (e) {
      Alert.alert('Recording failed', String(e))
    }
  }

  const stopRecording = async () => {
    if (!recordingRef.current) return
    try {
      await recordingRef.current.stopAndUnloadAsync()
      const uri      = recordingRef.current.getURI()
      const duration = Date.now() - recordStartRef.current
      recordingRef.current = null
      if (uri) {
        setRecordUri(uri)
        setDurationMs(duration)
        setState('recorded')
        onRecorded(uri, duration)
      } else {
        setState('idle')
      }
    } catch {
      setState('idle')
    }
  }

  const stopPlayback = async () => {
    if (playbackRef.current) {
      await playbackRef.current.unloadAsync().catch(() => {})
      playbackRef.current = null
    }
    setIsPlaying(false)
  }

  const playRecording = async () => {
    if (!recordUri) return
    if (isPlaying) { await stopPlayback(); return }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
      const { sound } = await Audio.Sound.createAsync({ uri: recordUri })
      playbackRef.current = sound
      setIsPlaying(true)
      await sound.playAsync()
      sound.setOnPlaybackStatusUpdate((s) => {
        if ('didJustFinish' in s && s.didJustFinish) setIsPlaying(false)
      })
    } catch { setIsPlaying(false) }
  }

  const deleteRecording = () => {
    stopPlayback()
    setRecordUri(null)
    setDurationMs(0)
    setState('idle')
  }

  const formatDuration = (ms: number) => {
    const s = Math.round(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <View style={vr.wrap}>
      <View style={vr.labelRow}>
        <Text style={vr.label}>Your pronunciation</Text>
        <Text style={vr.hint}>Optional — record yourself saying the word</Text>
      </View>

      <View style={vr.row}>
        {/* Mic / stop button */}
        {state !== 'recording' ? (
          <TouchableOpacity
            style={[vr.micBtn, state === 'recorded' && vr.micBtnDone]}
            onPress={startRecording}
          >
            <Text style={{ fontSize: 20 }}>🎙</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={vr.micBtnRec} onPress={stopRecording}>
            <Text style={{ fontSize: 20 }}>⏹</Text>
          </TouchableOpacity>
        )}

        {/* Waveform / status */}
        <View style={vr.waveTrack}>
          {state === 'idle' && (
            <Text style={vr.waveHint}>tap 🎙 to record</Text>
          )}
          {state === 'recording' && (
            <Text style={[vr.waveHint, { color: Colors.semantic.error }]}>● recording…</Text>
          )}
          {state === 'recorded' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
              {[6, 11, 15, 8, 13, 6, 9, 12, 7, 10].map((h, i) => (
                <View key={i} style={[vr.bar, { height: h,
                  backgroundColor: i % 2 === 0 ? Colors.accent.default : 'rgba(167,139,250,0.4)' }]} />
              ))}
              <Text style={[vr.waveHint, { marginLeft: 6 }]}>{formatDuration(durationMs)}</Text>
            </View>
          )}
        </View>

        {/* Play button — only if recorded */}
        {state === 'recorded' && (
          <TouchableOpacity
            style={[vr.actionBtn, isPlaying && { backgroundColor: Colors.accent.dim }]}
            onPress={playRecording}
          >
            <Text style={{ fontSize: 16 }}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        )}

        {/* Delete button — only if recorded */}
        {state === 'recorded' && (
          <TouchableOpacity style={vr.deleteBtn} onPress={deleteRecording}>
            <Ionicons name="trash-outline" size={16} color={Colors.semantic.error} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const vr = StyleSheet.create({
  wrap:       { marginBottom: 20 },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label:      { fontSize: 13, fontWeight: '500', color: Colors.text.secondary },
  hint:       { fontSize: 11, color: Colors.text.faint },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micBtn:     { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  micBtnDone: { backgroundColor: Colors.accent.dim, borderColor: 'rgba(167,139,250,0.3)' },
  micBtnRec:  { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(240,149,149,0.15)', borderWidth: 0.5, borderColor: 'rgba(240,149,149,0.35)', alignItems: 'center', justifyContent: 'center' },
  waveTrack:  { flex: 1, height: 44, borderRadius: 10, backgroundColor: Colors.bg.input, borderWidth: 0.5, borderColor: Colors.border.default, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  bar:        { width: 2, borderRadius: 1 },
  waveHint:   { fontSize: 12, color: Colors.text.faint },
  actionBtn:  { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  deleteBtn:  { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(240,149,149,0.1)', borderWidth: 0.5, borderColor: 'rgba(240,149,149,0.25)', alignItems: 'center', justifyContent: 'center' },
})

const ip = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn:    { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  iconBtnDone:{ backgroundColor: Colors.accent.dim, borderColor: 'rgba(167,139,250,0.3)' },
  track:      { flex: 1, height: 44, borderRadius: 10, backgroundColor: Colors.bg.input, borderWidth: 0.5, borderColor: Colors.border.default, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  hint:       { fontSize: 12, color: Colors.text.faint },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  thumb:      { width: 30, height: 30, borderRadius: 6 },
  previewText:{ fontSize: 12, color: Colors.text.secondary, flex: 1 },
  deleteBtn:  { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(240,149,149,0.1)', borderWidth: 0.5, borderColor: 'rgba(240,149,149,0.25)', alignItems: 'center', justifyContent: 'center' },
})

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { db } = useDatabase()
  const router = useRouter()

  const [front,        setFront]        = useState('')
  const [back,         setBack]         = useState('')
  const [cardType,     setCardType]     = useState<CardType>('other')
  const [example,      setExample]      = useState('')
  const [exampleTrans, setExampleTrans] = useState('')
  const [notes,        setNotes]        = useState('')
  const [imageUri,     setImageUri]     = useState<string | null>(null)
  const [studyBoth,    setStudyBoth]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [savedCount,   setSavedCount]   = useState(0)

  // Voice recording — stored after card is saved
  const voiceRef = useRef<{ uri: string; durationMs: number } | null>(null)

  const frontRef   = useRef<TextInput>(null)
  const backRef    = useRef<TextInput>(null)
  const exRef      = useRef<TextInput>(null)
  const exTransRef = useRef<TextInput>(null)
  const notesRef   = useRef<TextInput>(null)

  const clearForm = useCallback(() => {
    setFront(''); setBack(''); setCardType('other')
    setExample(''); setExampleTrans(''); setNotes('')
    setImageUri(null)
    voiceRef.current = null
    setTimeout(() => frontRef.current?.focus(), 100)
  }, [])

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      })
      if (!result.canceled) {
        setImageUri(result.assets[0].uri)
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image')
      console.error(e)
    }
  }, [])

  const handleSave = useCallback(async (andAddAnother: boolean) => {
    if (!front.trim()) { Alert.alert('Required', 'Front (word) is required'); return }
    if (!back.trim())  { Alert.alert('Required', 'Back (translation) is required'); return }
    if (!id) return

    setSaving(true)
    try {
      const card = await createCard(db, {
        deckId:              id,
        front:               front.trim(),
        back:                back.trim(),
        cardType,
        example:             example.trim()      || undefined,
        exampleTranslation:  exampleTrans.trim() || undefined,
        notes:               notes.trim()        || undefined,
        imageUri:            imageUri            || undefined,
        studyBothDirections: studyBoth,
      })

      // Save voice note if user recorded one
      if (voiceRef.current) {
        await saveVoiceNote(db, {
          cardId:     card.id,
          fileUri:    voiceRef.current.uri,
          durationMs: voiceRef.current.durationMs,
        })
      }

      setSavedCount(n => n + 1)

      if (andAddAnother) {
        clearForm()
      } else {
        router.replace({ pathname: '/deck/[id]', params: { id } })
      }
    } catch (e) {
      console.error('createCard error:', e)
      Alert.alert('Error saving card', String(e))
    } finally {
      setSaving(false)
    }
  }, [db, id, front, back, cardType, example, exampleTrans, notes, imageUri, studyBoth, clearForm, router])

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.replace({ pathname: '/deck/[id]', params: { id: id! } })}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={s.title}>Add card</Text>
          {savedCount > 0 && (
            <View style={s.savedBadge}>
              <Text style={s.savedBadgeText}>+{savedCount} saved</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Front */}
          <Field label="Front — word or phrase" required>
            <TextInput
              ref={frontRef}
              style={[s.input, s.inputLarge]}
              placeholder="e.g. Schlüssel"
              placeholderTextColor={Colors.text.faint}
              value={front}
              onChangeText={setFront}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => backRef.current?.focus()}
            />
          </Field>

          {/* Voice recorder — only for front word */}
          <VoiceRecorder
            onRecorded={(uri, durationMs) => { voiceRef.current = { uri, durationMs } }}
          />

          {/* Image picker */}
          <Field label="Card image">
            <View style={ip.row}>
              <TouchableOpacity
                style={[ip.iconBtn, imageUri && ip.iconBtnDone]}
                onPress={pickImage}
              >
                <Ionicons
                  name="image-outline"
                  size={20}
                  color={imageUri ? Colors.accent.default : Colors.text.muted}
                />
              </TouchableOpacity>

              <TouchableOpacity style={ip.track} onPress={pickImage} activeOpacity={0.7}>
                {imageUri ? (
                  <View style={ip.previewRow}>
                    <Image source={{ uri: imageUri }} style={ip.thumb} resizeMode="cover" />
                    <Text style={ip.previewText} numberOfLines={1}>Image selected</Text>
                  </View>
                ) : (
                  <Text style={ip.hint}>tap 🖼 to add image</Text>
                )}
              </TouchableOpacity>

              {imageUri && (
                <TouchableOpacity style={ip.deleteBtn} onPress={() => setImageUri(null)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.semantic.error} />
                </TouchableOpacity>
              )}
            </View>
          </Field>

          {/* Back */}
          <Field label="Back — translation" required>
            <TextInput
              ref={backRef}
              style={[s.input, s.inputLarge]}
              placeholder="e.g. key"
              placeholderTextColor={Colors.text.faint}
              value={back}
              onChangeText={setBack}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => exRef.current?.focus()}
            />
          </Field>

          {/* Card type */}
          <Field label="Card type">
            <TypeSelector value={cardType} onChange={setCardType} />
          </Field>

          {/* Example */}
          <Field label="Example sentence">
            <TextInput
              ref={exRef}
              style={s.input}
              placeholder={'"Ich habe den Schlüssel verloren."'}
              placeholderTextColor={Colors.text.faint}
              value={example}
              onChangeText={setExample}
              returnKeyType="next"
              onSubmitEditing={() => exTransRef.current?.focus()}
            />
          </Field>

          {/* Example translation */}
          <Field label="Example translation">
            <TextInput
              ref={exTransRef}
              style={s.input}
              placeholder={'"I lost the key."'}
              placeholderTextColor={Colors.text.faint}
              value={exampleTrans}
              onChangeText={setExampleTrans}
              returnKeyType="next"
              onSubmitEditing={() => notesRef.current?.focus()}
            />
          </Field>

          {/* Notes */}
          <Field label="Notes or mnemonic">
            <TextInput
              ref={notesRef}
              style={[s.input, s.inputMultiline]}
              placeholder="e.g. der → masculine, plural: Schlüssel"
              placeholderTextColor={Colors.text.faint}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Field>

          {/* Both directions toggle */}
          <View style={{ marginBottom: 24 }}>
            <Toggle
              value={studyBoth}
              onChange={setStudyBoth}
              label="Study both directions"
              sublabel="Also quiz: translation → word"
            />
          </View>

          {/* Save buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btnSecondary, saving && s.btnDisabled]}
              onPress={() => handleSave(true)}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.accent.default} />
                : <Ionicons name="add-circle-outline" size={18} color={Colors.accent.default} />
              }
              <Text style={s.btnSecondaryText}>Save + add another</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btnPrimary, saving && s.btnDisabled]}
              onPress={() => handleSave(false)}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark" size={18} color="#fff" />
              }
              <Text style={s.btnPrimaryText}>Save card</Text>
            </TouchableOpacity>
          </View>

          <View style={s.tip}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.text.faint} />
            <Text style={s.tipText}>
              "Save + add another" keeps you here to batch-add cards quickly.
              "Save card" saves and returns to the deck.
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  scroll: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle, gap: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bg.surface, borderWidth: 0.5, borderColor: Colors.border.default, alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 17, fontWeight: '500', color: Colors.text.primary, flex: 1 },
  savedBadge:     { backgroundColor: Colors.semantic.successDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  savedBadgeText: { fontSize: 12, fontWeight: '500', color: Colors.semantic.success },
  input:          { backgroundColor: Colors.bg.input, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border.default, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text.primary },
  inputLarge:     { fontSize: 18 },
  inputMultiline: { minHeight: 80, paddingTop: 12 },
  btnRow:          { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btnPrimary:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.accent.default, borderRadius: 14, paddingVertical: 13 },
  btnPrimaryText:  { fontSize: 14, fontWeight: '500', color: '#fff' },
  btnSecondary:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.bg.surface, borderRadius: 14, paddingVertical: 13, borderWidth: 0.5, borderColor: Colors.accent.default },
  btnSecondaryText:{ fontSize: 14, fontWeight: '500', color: Colors.accent.default },
  btnDisabled:     { opacity: 0.5 },
  tip:             { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: Colors.bg.surface, borderRadius: 10, padding: 12 },
  tipText:         { fontSize: 12, color: Colors.text.faint, lineHeight: 18, flex: 1 },
})