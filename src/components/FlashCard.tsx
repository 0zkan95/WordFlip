/**
 * FlashCard — flip card component
 *
 * Props:
 *   card      — the StudyCard from the DB
 *   reversed  — if true, show back as question and front as answer
 *   onRate    — called with rating 1-4 when user taps a button
 *
 * Platform:
 *   Web    — CSS perspective + rotateY transition (no reanimated)
 *   Native — lazy-loaded react-native-reanimated
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  StyleSheet, Text, View, Pressable, Image,
  TouchableOpacity, Platform,
} from 'react-native'
import * as Speech from '../utils/speech'
import { toBCP47 } from '../utils/languages'
import { Colors, posColor }         from '../theme/colors'
import { formatInterval, previewIntervals } from '../fsrs/scheduler'
import type { StudyCard }           from '../db/queries'
import type { Rating as DbRating }  from '../db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  card:           StudyCard
  reversed:       boolean
  targetLanguage: string | undefined
  voiceUri?:      string | null        // recorded pronunciation URI from voice_notes
  onRate:         (rating: DbRating) => void
}

const RATING_LABELS: Record<DbRating, string> = { 1:'Again', 2:'Hard', 3:'Good', 4:'Easy' }
const RATINGS: DbRating[] = [1, 2, 3, 4]

// ─── Web flip (CSS) ───────────────────────────────────────────────────────────

function WebFlipCard({ front, back, isBack, onFlip }: {
  front: React.ReactNode; back: React.ReactNode; isBack: boolean; onFlip: () => void
}) {
  return (
    // @ts-ignore
    <div onClick={onFlip} style={{ perspective:'1000px', cursor:'pointer', marginBottom:12 }}>
      <div style={{
        position:'relative', width:'100%', minHeight:340,
        transformStyle:'preserve-3d',
        transition:'transform 0.35s ease',
        transform: isBack ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden' }}>
          {front}
        </div>
        <div style={{ position:'absolute', top:0, left:0, right:0, backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', transform:'rotateY(180deg)' }}>
          {back}
        </div>
      </div>
    </div>
  )
}

// ─── Native flip (Reanimated, lazy) ──────────────────────────────────────────

function NativeFlipCard({ front, back, isBack, onFlip }: {
  front: React.ReactNode; back: React.ReactNode; isBack: boolean; onFlip: () => void
}) {
  const { default: Animated, useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing } =
    require('react-native-reanimated')

  const rotate = useSharedValue(isBack ? 1 : 0)
  useEffect(() => {
    rotate.value = withTiming(isBack ? 1 : 0, { duration: 320, easing: Easing.inOut(Easing.ease) })
  }, [isBack])

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotate.value,[0,1],[0,180])}deg` }],
    backfaceVisibility:'hidden', position:'absolute', top:0, left:0, right:0,
    opacity: rotate.value < 0.5 ? 1 : 0,
  }))
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotate.value,[0,1],[180,360])}deg` }],
    backfaceVisibility:'hidden', position:'absolute', top:0, left:0, right:0,
    opacity: rotate.value >= 0.5 ? 1 : 0,
  }))

  return (
    <Pressable style={{ height:360, marginBottom:12 }} onPress={onFlip}>
      <Animated.View style={frontStyle}>{front}</Animated.View>
      <Animated.View style={backStyle}>{back}</Animated.View>
    </Pressable>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function FlashCard({
  card, reversed, targetLanguage, voiceUri = null, onRate,
}: Props) {
  const [isBack, setIsBack]                 = useState(false)
  const playbackRef                         = useRef<any>(null)
  const [isPlaying, setIsPlaying]           = useState(false)

  // What text goes on front/back depends on reversed mode
  const questionText = reversed ? card.back  : card.front
  const answerText   = reversed ? card.front : card.back
  const intervals    = previewIntervals(card.fsrs)

  // TTS always speaks card.front — the target language word —
  // regardless of which side is showing. That's always the word to learn.
  const targetWord = card.front

  // Reset state when card changes
  useEffect(() => {
    setIsBack(false); setIsPlaying(false)
    return () => { stopPlayback() }
  }, [card.id, reversed])

  const flip = useCallback(() => setIsBack(v => !v), [])

  // ─── TTS ──────────────────────────────────────────────────────────────────
  const speakQuestion = useCallback(() => {
    // Always speak the target language word (card.front) regardless of reversed mode
    Speech.speak(targetWord, toBCP47(targetLanguage))
  }, [targetWord, targetLanguage])

  const stopPlayback = useCallback(async () => {
    if (playbackRef.current) {
      await playbackRef.current.unloadAsync().catch(() => {})
      playbackRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const playVoiceNote = useCallback(async (uri: string) => {
    if (isPlaying) { await stopPlayback(); return }
    try {
      const { Audio } = require('expo-av')
      const { sound } = await Audio.Sound.createAsync({ uri })
      playbackRef.current = sound
      setIsPlaying(true)
      await sound.playAsync()
      sound.setOnPlaybackStatusUpdate((s: any) => {
        if ('didJustFinish' in s && s.didJustFinish) setIsPlaying(false)
      })
    } catch { setIsPlaying(false) }
  }, [isPlaying, stopPlayback])

  // ─── Sub-components ───────────────────────────────────────────────────────

  const pillColors = posColor(card.cardType)

  const CardHeader = () => (
    <View style={s.cardHeader}>
      <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
        <View style={[s.pill, { backgroundColor:pillColors.bg }]}>
          <Text style={[s.pillText, { color:pillColors.text }]}>{card.cardType}</Text>
        </View>
        {reversed && (
          <View style={s.reversedBadge}>
            <Text style={s.reversedBadgeText}>↩ reversed</Text>
          </View>
        )}
      </View>
    </View>
  )

  const RatingButtons = () => (
    <View style={s.ratingSection}>
      <Text style={s.ratingHint}>How well did you remember?</Text>
      <View style={s.ratingRow}>
        {RATINGS.map((r) => {
          const c    = Colors.rating[RATING_LABELS[r].toLowerCase() as keyof typeof Colors.rating]
          const days = r===1?intervals.again : r===2?intervals.hard : r===3?intervals.good : intervals.easy
          return (
            <TouchableOpacity
              key={r}
              style={[s.ratingBtn, { backgroundColor:c.bg, borderColor:c.border }]}
              onPress={() => onRate(r)} activeOpacity={0.7}
            >
              <Text style={[s.ratingLabel, { color:c.text }]}>{RATING_LABELS[r]}</Text>
              <Text style={[s.ratingInterval, { color:c.text }]}>{formatInterval(days)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )

  // ─── Card faces ───────────────────────────────────────────────────────────

  const FrontFace = (
    <View style={s.cardFace}>
      <CardHeader />
      {card.imageUri && (
        <View style={s.imageContainer}>
          <Image
            source={{ uri: card.imageUri }}
            style={s.cardImage}
            resizeMode="contain"
          />
        </View>
      )}
      <View style={s.wordArea}>
        <Text style={s.word}>{questionText}</Text>
        {/* TTS speaker — only on forward cards. Reversed = cheating */}
        {!reversed && (
          <View style={s.frontActions}>
            <TouchableOpacity style={[s.iconBtn, s.iconBtnAccent]} onPress={speakQuestion}>
              <Text style={s.iconText}>🔊</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={s.tapHint}>tap card to reveal</Text>
      </View>
      {/* Example sentence — front only, forward cards only */}
      {!reversed && card.example && (
        <View style={s.exampleSection}>
          <Text style={s.sectionLabel}>EXAMPLE</Text>
          <Text style={s.example}>{card.example}</Text>
        </View>
      )}
      {/* Play recorded voice — only shown if user recorded something */}
      {voiceUri && (
        <TouchableOpacity
          style={[s.voicePlayBtn, isPlaying && s.voicePlayBtnActive]}
          onPress={() => playVoiceNote(voiceUri!)}
        >
          <Text style={s.iconText}>{isPlaying ? '⏸' : '🎤'}</Text>
          <Text style={s.voicePlayLabel}>{isPlaying ? 'Stop' : 'My recording'}</Text>
        </TouchableOpacity>
      )}
    </View>
  )

  const BackFace = (
    <View style={[s.cardFace, s.cardFaceBack]}>
      <CardHeader />
      {/* Centered answer — takes all remaining space */}
      <View style={s.backWordArea}>
        <Text style={s.word}>{answerText}</Text>
        {/* Notes inline for forward cards (e.g. article: "der") */}
        {card.notes && !reversed && (
          <Text style={s.articleText}>{card.notes}</Text>
        )}
        {/* Notes below for reversed cards */}
        {card.notes && reversed && (
          <Text style={s.notesText}>{card.notes}</Text>
        )}
      </View>
    </View>
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {Platform.OS === 'web'
        ? <WebFlipCard front={FrontFace} back={BackFace} isBack={isBack} onFlip={flip} />
        : <NativeFlipCard front={FrontFace} back={BackFace} isBack={isBack} onFlip={flip} />
      }
      {isBack
        ? <RatingButtons />
        : <View style={s.ratingPlaceholder}><Text style={s.tapHint}>tap card to flip</Text></View>
      }
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex:1, paddingHorizontal:14 },

  cardFace: {
    backgroundColor:Colors.bg.surface, borderRadius:20,
    borderWidth:0.5, borderColor:Colors.border.default, padding:20,
    minHeight:320,
  },
  cardFaceBack: { borderColor:Colors.border.accent },

  cardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  imageContainer: { width:'100%', height:160, borderRadius:12, overflow:'hidden', marginBottom:14, backgroundColor:Colors.bg.elevated },
  cardImage: { width:'100%', height:'100%' },
  pill:       { paddingHorizontal:10, paddingVertical:3, borderRadius:20 },
  pillText:   { fontSize:11, fontWeight:'500' },
  reversedBadge: { backgroundColor:'rgba(56,138,221,0.15)', paddingHorizontal:8, paddingVertical:2, borderRadius:10 },
  reversedBadgeText: { fontSize:10, fontWeight:'500', color:'#85B7EB' },
  headerIcons: { flexDirection:'row', gap:8 },
  iconBtn: {
    width:36, height:36, borderRadius:10,
    backgroundColor:'rgba(255,255,255,0.07)',
    borderWidth:0.5, borderColor:Colors.border.default,
    alignItems:'center', justifyContent:'center',
  },
  iconBtnAccent: { backgroundColor:Colors.accent.dim, borderColor:'rgba(167,139,250,0.3)' },
  iconText: { fontSize:16 },

  wordArea:     { alignItems:'center', paddingVertical:18 },
  word:         { fontSize:30, fontWeight:'500', color:Colors.text.primary, letterSpacing:-0.5, marginBottom:10 },
  frontActions: { flexDirection:'row', gap:8, marginBottom:6 },
  tapHint:      { fontSize:13, color:Colors.text.faint },
  // Back face — centered vertically
  backWordArea: { flex:1, alignItems:'center', justifyContent:'center', paddingVertical:24, minHeight:220 },
  articleText:  { fontSize:14, color:Colors.text.muted, fontStyle:'italic', marginTop:6, textAlign:'center' },
  notesText:    { fontSize:13, color:Colors.text.muted, fontStyle:'italic', marginTop:6, textAlign:'center' },

  exampleSection: { borderTopWidth:0.5, borderTopColor:Colors.border.subtle, paddingTop:10, marginBottom:10 },
  sectionLabel:   { fontSize:11, color:Colors.text.faint, letterSpacing:0.06, marginBottom:4 },
  example:        { fontSize:13, color:Colors.text.secondary, lineHeight:20, fontStyle:'italic' },
  exampleTrans:   { fontSize:12, color:Colors.text.muted, fontStyle:'italic', marginTop:2 },

  voicePlayBtn: {
    flexDirection:'row', alignItems:'center', gap:6,
    marginTop:10, alignSelf:'center',
    backgroundColor:'rgba(167,139,250,0.1)',
    borderWidth:0.5, borderColor:'rgba(167,139,250,0.3)',
    borderRadius:20, paddingHorizontal:14, paddingVertical:7,
  },
  voicePlayBtnActive: { backgroundColor:Colors.accent.dim },
  voicePlayLabel: { fontSize:12, color:Colors.accent.default, fontWeight:'500' },

  ratingSection:  { paddingTop:4 },
  ratingHint:     { fontSize:11, color:Colors.text.muted, textAlign:'center', marginBottom:10 },
  ratingRow:      { flexDirection:'row', gap:8 },
  ratingBtn:      { flex:1, paddingVertical:10, borderRadius:12, alignItems:'center', borderWidth:0.5 },
  ratingLabel:    { fontSize:13, fontWeight:'500' },
  ratingInterval: { fontSize:10, marginTop:1, opacity:0.65 },
  ratingPlaceholder: { alignItems:'center', paddingTop:16 },
})