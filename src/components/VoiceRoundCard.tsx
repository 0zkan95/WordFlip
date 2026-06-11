/**
 * src/components/VoiceRoundCard.tsx
 *
 * Shows the back of a card, user speaks the front.
 * Uses expo-speech-recognition for web and Android.
 *
 * State machine:
 *   idle → listening (tap mic) → done (speech ends / final result)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import * as Speech from '../utils/speech'

import type { StudyCard } from '../db/queries'
import { checkAnswer, WritingResult } from './WritingExerciseCard'
import { Colors } from '../theme/colors'

// ─── Result config ────────────────────────────────────────────────────────────

const RESULT_CONFIG: Record<WritingResult, {
  icon:  React.ComponentProps<typeof Ionicons>['name']
  color: string
  bg:    string
  label: string
}> = {
  correct: { icon: 'checkmark-circle', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  label: 'Correct!' },
  close:   { icon: 'ellipse',          color: '#facc15', bg: 'rgba(250,204,21,0.12)',   label: 'Close enough' },
  wrong:   { icon: 'close-circle',     color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Not quite' },
}

// ─── Component ────────────────────────────────────────────────────────────────

type CardState = 'idle' | 'requesting' | 'listening' | 'done'

interface Props {
  card:    StudyCard
  lang:    string        // BCP-47 language code, e.g. 'de-DE'
  current: number
  total:   number
  onNext:  (result: WritingResult) => void
  onSkip:  () => void
}

const MAX_ATTEMPTS = 3

export default function VoiceRoundCard({ card, lang, current, total, onNext, onSkip }: Props) {
  const [cardState,  setCardState]  = useState<CardState>('idle')
  const [transcript, setTranscript] = useState('')
  const [result,     setResult]     = useState<WritingResult | null>(null)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [attempts,   setAttempts]   = useState(1)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  // Reset state whenever the card changes
  useEffect(() => {
    ExpoSpeechRecognitionModule.abort()
    setCardState('idle')
    setTranscript('')
    setResult(null)
    setErrorMsg(null)
    setAttempts(1)
  }, [card.id])

  // Pulse the mic ring while listening
  useEffect(() => {
    if (cardState === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
        ])
      )
      pulseLoop.current.start()
    } else {
      pulseLoop.current?.stop()
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    }
  }, [cardState])

  // ── Speech recognition event listeners ──────────────────────────────────────

  useSpeechRecognitionEvent('result', useCallback((event) => {
    const text = event.results[0]?.transcript ?? ''
    setTranscript(text)
    if (event.isFinal && text) {
      setCardState('done')
      setResult(checkAnswer(text, card.front))
    }
  }, [card.front]))

  useSpeechRecognitionEvent('end', useCallback(() => {
    // If we ended without a final result the user didn't speak
    setCardState(prev => {
      if (prev === 'listening') {
        setErrorMsg('Nothing detected — tap the mic and try again.')
        return 'idle'
      }
      return prev
    })
  }, []))

  useSpeechRecognitionEvent('error', useCallback((event) => {
    const msg = (event as any).message ?? (event as any).error ?? 'Unknown error'
    // 'no-speech' and 'aborted' are normal; don't show an error for them
    if (msg !== 'no-speech' && msg !== 'aborted') {
      setErrorMsg(`Could not recognise speech (${msg})`)
    }
    setCardState('idle')
  }, []))

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleMic = async () => {
    if (cardState === 'listening') {
      ExpoSpeechRecognitionModule.stop()
      setCardState('idle')
      return
    }

    setErrorMsg(null)
    setTranscript('')
    setResult(null)
    setCardState('requesting')

    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!granted) {
        setErrorMsg('Microphone permission is required for voice exercises.')
        setCardState('idle')
        return
      }

      setCardState('listening')
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: false,
      })
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to start recognition.')
      setCardState('idle')
    }
  }

  const handleTryAgain = () => {
    ExpoSpeechRecognitionModule.abort()
    setAttempts(a => a + 1)
    setTranscript('')
    setResult(null)
    setErrorMsg(null)
    setCardState('idle')
  }

  const handleNext = () => {
    if (result) onNext(result)
  }

  const cfg = result ? RESULT_CONFIG[result] : null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.modePill}>
          <Ionicons name="mic" size={12} color={Colors.accent.default} />
          <Text style={s.modePillText}>Voice</Text>
        </View>
        <Text style={s.progress}>{current} / {total}</Text>
        <TouchableOpacity onPress={onSkip}>
          <Text style={s.skipText}>Skip round</Text>
        </TouchableOpacity>
      </View>

      {/* Prompt card */}
      <View style={s.promptCard}>
        <Text style={s.promptLabel}>Say the word for:</Text>
        <Text style={s.promptText}>{card.back}</Text>
        {card.notes ? <Text style={s.promptNotes}>{card.notes}</Text> : null}
      </View>

      {/* Mic button */}
      <View style={s.micArea}>
        <Animated.View style={[
          s.micRing,
          cardState === 'listening' && s.micRingActive,
          { transform: [{ scale: pulseAnim }] },
        ]} />
        <TouchableOpacity
          style={[s.micBtn, cardState === 'listening' && s.micBtnActive]}
          onPress={handleMic}
          disabled={cardState === 'requesting' || cardState === 'done'}
          activeOpacity={0.8}
        >
          {cardState === 'requesting'
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons
                name={cardState === 'listening' ? 'stop' : 'mic'}
                size={32}
                color="#fff"
              />
          }
        </TouchableOpacity>
      </View>

      {/* Status text */}
      <Text style={s.statusText}>
        {cardState === 'idle'      && 'Tap the mic and say the word'}
        {cardState === 'requesting' && 'Requesting permission…'}
        {cardState === 'listening'  && 'Listening… tap to stop'}
        {cardState === 'done'       && ' '}
      </Text>

      {/* Live transcript */}
      {(transcript.length > 0) && (
        <View style={s.transcriptBox}>
          <Text style={s.transcriptText}>"{transcript}"</Text>
        </View>
      )}

      {/* Error message */}
      {errorMsg && (
        <Text style={s.errorText}>{errorMsg}</Text>
      )}

      {/* Result feedback */}
      {result && cfg && (
        <View style={[s.feedback, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
          <View style={s.feedbackRow}>
            <Ionicons name={cfg.icon} size={20} color={cfg.color} />
            <Text style={[s.feedbackLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={s.attemptCount}>Attempt {attempts}/{MAX_ATTEMPTS}</Text>
          </View>
          {result !== 'correct' && (
            <View style={s.correctRow}>
              <Text style={s.feedbackAnswer}>
                Correct: <Text style={s.feedbackAnswerBold}>{card.front}</Text>
              </Text>
              <TouchableOpacity
                style={s.speakBtn}
                onPress={() => Speech.speak(card.front, lang)}
                activeOpacity={0.7}
              >
                <Ionicons name="volume-high" size={16} color={Colors.accent.default} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={s.actions}>
        {result ? (
          <View style={s.btnRow}>
            {result !== 'correct' && (
              <TouchableOpacity
                style={[s.tryAgainBtn, attempts >= MAX_ATTEMPTS && s.tryAgainBtnDisabled]}
                onPress={handleTryAgain}
                disabled={attempts >= MAX_ATTEMPTS}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color={attempts >= MAX_ATTEMPTS ? Colors.text.faint : Colors.accent.default} />
                <Text style={[s.tryAgainText, attempts >= MAX_ATTEMPTS && s.tryAgainTextDisabled]}>
                  Try again
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.nextBtn}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={s.nextBtnText}>{current >= total ? 'Finish' : 'Next'}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.nextBtnPlaceholder} />
        )}
      </View>

    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const MIC_SIZE = 80

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.bg.base,
    paddingHorizontal: 20, paddingBottom: 32,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 16, paddingBottom: 20,
  },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.accent.dim, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  modePillText: { fontSize: 12, fontWeight: '600', color: Colors.accent.default },
  progress:    { fontSize: 14, color: Colors.text.muted, fontWeight: '500' },
  skipText:    { fontSize: 13, color: Colors.text.faint },

  promptCard: {
    backgroundColor: Colors.bg.surface, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 24, marginBottom: 32, alignItems: 'center',
  },
  promptLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.text.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
  },
  promptText:  { fontSize: 26, fontWeight: '600', color: Colors.text.primary, textAlign: 'center', lineHeight: 34 },
  promptNotes: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center', marginTop: 8 },

  micArea: {
    alignItems: 'center', justifyContent: 'center',
    height: MIC_SIZE + 40, marginBottom: 16,
  },
  micRing: {
    position: 'absolute',
    width: MIC_SIZE + 24, height: MIC_SIZE + 24,
    borderRadius: (MIC_SIZE + 24) / 2,
    backgroundColor: 'transparent',
    borderWidth: 2, borderColor: 'transparent',
  },
  micRingActive: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  micBtn: {
    width: MIC_SIZE, height: MIC_SIZE, borderRadius: MIC_SIZE / 2,
    backgroundColor: Colors.accent.default,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent.default,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
  micBtnActive: { backgroundColor: '#ef4444' },

  statusText: {
    textAlign: 'center', fontSize: 14, color: Colors.text.muted,
    marginBottom: 16, minHeight: 20,
  },

  transcriptBox: {
    backgroundColor: Colors.bg.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border.default,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
    alignItems: 'center',
  },
  transcriptText: { fontSize: 18, color: Colors.text.primary, fontWeight: '500', fontStyle: 'italic' },

  errorText: {
    textAlign: 'center', fontSize: 13, color: '#f87171',
    marginBottom: 12, paddingHorizontal: 8,
  },

  feedback: {
    borderRadius: 12, borderWidth: 0.5,
    padding: 14, marginBottom: 16,
  },
  feedbackRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  feedbackLabel:     { fontSize: 15, fontWeight: '700' },
  correctRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  feedbackAnswer:    { fontSize: 14, color: Colors.text.secondary, flex: 1 },
  feedbackAnswerBold:{ fontWeight: '600', color: Colors.text.primary },
  speakBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent.dim,
    alignItems: 'center', justifyContent: 'center',
  },

  attemptCount: { fontSize: 12, color: Colors.text.faint, marginLeft: 'auto' },

  actions: { marginTop: 'auto' },
  btnRow: { flexDirection: 'row', gap: 10 },

  tryAgainBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.accent.default,
    borderRadius: 14, paddingVertical: 16,
  },
  tryAgainBtnDisabled: {
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.surface,
  },
  tryAgainText:         { fontSize: 15, fontWeight: '600', color: Colors.accent.default },
  tryAgainTextDisabled: { color: Colors.text.faint },

  nextBtn: {
    flex: 1, backgroundColor: Colors.accent.default, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnText:        { fontSize: 16, fontWeight: '700', color: '#fff' },
  nextBtnPlaceholder: { height: 52 },
})
