/**
 * app/deck/[id]/edit-card.tsx — Edit card screen
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'

import { useDatabase }          from '../../../src/context/DatabaseContext'
import { getCard, updateCard }  from '../../../src/db/queries'
import type { CardType }        from '../../../src/db/schema'
import { Colors, posColor }     from '../../../src/theme/colors'

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
  value: boolean; onChange: (v: boolean) => void
  label: string; sublabel: string
}) {
  return (
    <TouchableOpacity style={[tg.row, value && tg.rowOn]} onPress={() => onChange(!value)} activeOpacity={0.85}>
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EditCardScreen() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId: string }>()
  const { db }         = useDatabase()
  const router         = useRouter()

  const [front,        setFront]        = useState('')
  const [back,         setBack]         = useState('')
  const [cardType,     setCardType]     = useState<CardType>('other')
  const [example,      setExample]      = useState('')
  const [exampleTrans, setExampleTrans] = useState('')
  const [notes,        setNotes]        = useState('')
  const [imageUri,     setImageUri]     = useState<string | null>(null)
  const [studyBoth,    setStudyBoth]    = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  const backRef    = useRef<TextInput>(null)
  const exRef      = useRef<TextInput>(null)
  const exTransRef = useRef<TextInput>(null)
  const notesRef   = useRef<TextInput>(null)

  // Load existing card data
  useEffect(() => {
    if (!cardId) return
    getCard(db, cardId).then((c) => {
      if (!c) return
      setFront(c.front)
      setBack(c.back)
      setCardType(c.cardType)
      setExample(c.example ?? '')
      setExampleTrans(c.exampleTranslation ?? '')
      setNotes(c.notes ?? '')
      setImageUri(c.imageUri ?? null)
      setStudyBoth(c.studyBothDirections)
    }).finally(() => setLoading(false))
  }, [db, cardId])

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

  const handleSave = useCallback(async () => {
    if (!front.trim()) { Alert.alert('Front is required'); return }
    if (!back.trim())  { Alert.alert('Translation is required'); return }
    if (!cardId) return

    setSaving(true)
    try {
      await updateCard(db, cardId, {
        front:               front.trim(),
        back:                back.trim(),
        cardType,
        example:             example.trim()      || undefined,
        exampleTranslation:  exampleTrans.trim() || undefined,
        notes:               notes.trim()         || undefined,
        imageUri:            imageUri            || undefined,
        studyBothDirections: studyBoth,
      })
      router.back()
    } catch (e) {
      Alert.alert('Error saving', String(e))
    } finally {
      setSaving(false)
    }
  }, [db, cardId, front, back, cardType, example, exampleTrans, notes, imageUri, studyBoth, router])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.accent.default} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={s.title}>Edit card</Text>
          <TouchableOpacity
            style={[s.saveHeaderBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave} disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveHeaderBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <Field label="Front — word or phrase" required>
            <TextInput
              style={[s.input, s.inputLarge]}
              placeholder="e.g. Schlüssel"
              placeholderTextColor={Colors.text.faint}
              value={front} onChangeText={setFront}
              autoFocus autoCapitalize="none" autoCorrect={false}
              returnKeyType="next" onSubmitEditing={() => backRef.current?.focus()}
            />
          </Field>

          <Field label="Card image">
            <TouchableOpacity
              style={[s.input, s.imagePicker, imageUri && s.imagePickerActive]}
              onPress={pickImage}
            >
              {imageUri ? (
                <View style={s.imagePreview}>
                  <Image
                    source={{ uri: imageUri }}
                    style={s.previewImage}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={s.removeImageBtn}
                    onPress={(e) => {
                      e.stopPropagation()
                      setImageUri(null)
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.imagePickerContent}>
                  <Ionicons name="image-outline" size={24} color={Colors.accent.default} />
                  <Text style={s.imagePickerText}>Tap to add image</Text>
                </View>
              )}
            </TouchableOpacity>
          </Field>

          <Field label="Back — translation" required>
            <TextInput
              ref={backRef}
              style={[s.input, s.inputLarge]}
              placeholder="e.g. key"
              placeholderTextColor={Colors.text.faint}
              value={back} onChangeText={setBack}
              autoCapitalize="none" autoCorrect={false}
              returnKeyType="next" onSubmitEditing={() => exRef.current?.focus()}
            />
          </Field>

          <Field label="Card type">
            <TypeSelector value={cardType} onChange={setCardType} />
          </Field>

          <Field label="Example sentence">
            <TextInput
              ref={exRef}
              style={s.input}
              placeholder={'"Ich habe den Schlüssel verloren."'}
              placeholderTextColor={Colors.text.faint}
              value={example} onChangeText={setExample}
              returnKeyType="next" onSubmitEditing={() => exTransRef.current?.focus()}
            />
          </Field>

          <Field label="Example translation">
            <TextInput
              ref={exTransRef}
              style={s.input}
              placeholder={'"I lost the key."'}
              placeholderTextColor={Colors.text.faint}
              value={exampleTrans} onChangeText={setExampleTrans}
              returnKeyType="next" onSubmitEditing={() => notesRef.current?.focus()}
            />
          </Field>

          <Field label="Notes or mnemonic">
            <TextInput
              ref={notesRef}
              style={[s.input, s.inputMultiline]}
              placeholder="e.g. der → masculine, plural: Schlüssel"
              placeholderTextColor={Colors.text.faint}
              value={notes} onChangeText={setNotes}
              multiline numberOfLines={3} textAlignVertical="top"
            />
          </Field>

          {/* Both directions toggle */}
          <View style={s.toggleWrap}>
            <Toggle
              value={studyBoth}
              onChange={setStudyBoth}
              label="Study both directions"
              sublabel="Also quiz: translation → word"
            />
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave} disabled={saving}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={s.saveBtnText}>Save changes</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, backgroundColor: Colors.bg.base, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle, gap: 10,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  title:            { flex: 1, fontSize: 17, fontWeight: '500', color: Colors.text.primary },
  saveHeaderBtn:    { backgroundColor: Colors.accent.default, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7 },
  saveHeaderBtnText:{ fontSize: 14, fontWeight: '500', color: '#fff' },

  input: {
    backgroundColor: Colors.bg.input, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text.primary,
  },
  inputLarge:     { fontSize: 18 },
  inputMultiline: { minHeight: 80, paddingTop: 12 },
  imagePicker:    { height: 160, padding: 0, backgroundColor: Colors.bg.input, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  imagePickerActive: { padding: 0 },
  imagePickerContent: { alignItems: 'center', gap: 8 },
  imagePickerText: { fontSize: 14, color: Colors.accent.default, fontWeight: '500' },
  imagePreview: { width: '100%', height: '100%', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  removeImageBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },

  toggleWrap: { marginBottom: 20 },

  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent.default, borderRadius: 14, paddingVertical: 14 },
  saveBtnText: { fontSize: 14, fontWeight: '500', color: '#fff' },
})