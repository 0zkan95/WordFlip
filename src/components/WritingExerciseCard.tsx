/**
 * src/components/WritingExerciseCard.tsx
 *
 * Shows the back of a card as a prompt and expects the user to type the front.
 * Feedback: correct (exact/near match) / close (1-2 char typo) / wrong.
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { StudyCard } from '../db/queries'
import { Colors } from '../theme/colors'

// ─── Levenshtein distance ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export type WritingResult = 'correct' | 'close' | 'wrong'

export function checkAnswer(input: string, correct: string): WritingResult {
  const norm = (s: string) => s.trim().toLowerCase()
  const a = norm(input), b = norm(correct)
  if (!a) return 'wrong'
  if (a === b) return 'correct'
  // Allow 1 typo per ~5 chars (capped at 2)
  const tolerance = Math.min(2, Math.floor(b.length / 5))
  if (tolerance > 0 && levenshtein(a, b) <= tolerance) return 'close'
  return 'wrong'
}

// ─── Result config ────────────────────────────────────────────────────────────

const RESULT_CONFIG: Record<WritingResult, {
  icon: React.ComponentProps<typeof Ionicons>['name']
  color: string
  bg: string
  label: string
}> = {
  correct: { icon: 'checkmark-circle', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Correct!' },
  close:   { icon: 'ellipse',          color: '#facc15', bg: 'rgba(250,204,21,0.12)',  label: 'Close enough' },
  wrong:   { icon: 'close-circle',     color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Not quite' },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  card:     StudyCard
  current:  number
  total:    number
  onNext:   (result: WritingResult) => void
  onSkip:   () => void
}

export default function WritingExerciseCard({ card, current, total, onNext, onSkip }: Props) {
  const [input,    setInput]    = useState('')
  const [result,   setResult]   = useState<WritingResult | null>(null)
  const inputRef = useRef<TextInput>(null)
  const shake    = useRef(new Animated.Value(0)).current

  // Auto-focus input on each new card
  useEffect(() => {
    setInput('')
    setResult(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [card.id])

  const handleCheck = () => {
    if (!input.trim()) return
    const r = checkAnswer(input, card.front)
    setResult(r)
    if (r === 'wrong') {
      Animated.sequence([
        Animated.timing(shake, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start()
    }
  }

  const handleNext = () => {
    if (result) onNext(result)
  }

  const cfg = result ? RESULT_CONFIG[result] : null

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.container}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.modePill}>
              <Ionicons name="pencil" size={12} color={Colors.accent.default} />
              <Text style={s.modePillText}>Writing</Text>
            </View>
          </View>
          <Text style={s.progress}>{current} / {total}</Text>
          <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
            <Text style={s.skipText}>Skip round</Text>
          </TouchableOpacity>
        </View>

        {/* ── Prompt card ─────────────────────────────────────────────── */}
        <View style={s.promptCard}>
          <Text style={s.promptLabel}>Type the word for:</Text>
          <Text style={s.promptText}>{card.back}</Text>
          {card.notes ? <Text style={s.promptNotes}>{card.notes}</Text> : null}
        </View>

        {/* ── Input area ─────────────────────────────────────────────── */}
        <Animated.View style={[s.inputWrap, { transform: [{ translateX: shake }] }]}>
          <TextInput
            ref={inputRef}
            style={[
              s.input,
              result === 'correct' && s.inputCorrect,
              result === 'close'   && s.inputClose,
              result === 'wrong'   && s.inputWrong,
            ]}
            value={input}
            onChangeText={result ? undefined : setInput}
            editable={result === null}
            placeholder="Type your answer…"
            placeholderTextColor={Colors.text.faint}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            onSubmitEditing={result ? handleNext : handleCheck}
          />
          {result && (
            <View style={[s.resultIcon, { backgroundColor: cfg!.bg }]}>
              <Ionicons name={cfg!.icon} size={22} color={cfg!.color} />
            </View>
          )}
        </Animated.View>

        {/* ── Feedback ────────────────────────────────────────────────── */}
        {result && (
          <View style={[s.feedback, { backgroundColor: cfg!.bg, borderColor: cfg!.color + '40' }]}>
            <Text style={[s.feedbackLabel, { color: cfg!.color }]}>{cfg!.label}</Text>
            {result !== 'correct' && (
              <Text style={s.feedbackAnswer}>
                Correct answer: <Text style={s.feedbackAnswerBold}>{card.front}</Text>
              </Text>
            )}
          </View>
        )}

        {/* ── Action button ────────────────────────────────────────────── */}
        <View style={s.actions}>
          {result === null ? (
            <TouchableOpacity
              style={[s.btn, !input.trim() && s.btnDisabled]}
              onPress={handleCheck}
              disabled={!input.trim()}
              activeOpacity={0.8}
            >
              <Text style={s.btnText}>Check</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.btn} onPress={handleNext} activeOpacity={0.8}>
              <Text style={s.btnText}>
                {current >= total ? 'Finish' : 'Next'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}
        </View>

      </View>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.bg.base,
    paddingHorizontal: 20, paddingBottom: 32,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 16, paddingBottom: 20,
  },
  headerLeft: { flex: 1 },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.accent.dim, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  modePillText: { fontSize: 12, fontWeight: '600', color: Colors.accent.default },
  progress: { fontSize: 14, color: Colors.text.muted, fontWeight: '500' },
  skipBtn: { flex: 1, alignItems: 'flex-end' },
  skipText: { fontSize: 13, color: Colors.text.faint },

  promptCard: {
    backgroundColor: Colors.bg.surface, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 24, marginBottom: 24, alignItems: 'center',
  },
  promptLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.text.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
  },
  promptText: {
    fontSize: 26, fontWeight: '600', color: Colors.text.primary,
    textAlign: 'center', lineHeight: 34,
  },
  promptNotes: {
    fontSize: 14, color: Colors.text.secondary, textAlign: 'center',
    marginTop: 8, lineHeight: 20,
  },

  inputWrap: { position: 'relative', marginBottom: 16 },
  input: {
    backgroundColor: Colors.bg.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border.default,
    paddingHorizontal: 16, paddingVertical: 14, paddingRight: 52,
    fontSize: 18, color: Colors.text.primary, fontWeight: '500',
  },
  inputCorrect: { borderColor: '#4ade80' },
  inputClose:   { borderColor: '#facc15' },
  inputWrong:   { borderColor: '#f87171' },

  resultIcon: {
    position: 'absolute', right: 12, top: 12,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  feedback: {
    borderRadius: 12, borderWidth: 0.5,
    padding: 14, marginBottom: 24, alignItems: 'center',
  },
  feedbackLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  feedbackAnswer: { fontSize: 14, color: Colors.text.secondary },
  feedbackAnswerBold: { fontWeight: '600', color: Colors.text.primary },

  actions: { marginTop: 'auto' },
  btn: {
    backgroundColor: Colors.accent.default, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
