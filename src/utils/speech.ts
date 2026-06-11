/**
 * src/utils/speech.ts — native (iOS / Android)
 * Uses expo-speech which calls the OS TTS engine.
 */
import * as ExpoSpeech from 'expo-speech'
import { Platform } from 'react-native'

export function speak(text: string, language?: string): void {
  ExpoSpeech.stop()
  // Android's TTS module passes `language` straight into java.util.Locale(String),
  // which only accepts a bare ISO 639-1 code (e.g. "de"). A BCP-47 code like "de-DE"
  // makes Locale.getISO3Language() throw inside isLanguageAvailable(), rejecting the
  // speak() call with no audio and no visible error. iOS's AVSpeechSynthesisVoice
  // expects the full BCP-47 code, so only strip the region on Android.
  const ttsLanguage = Platform.OS === 'android' ? language?.split('-')[0] : language
  ExpoSpeech.speak(text, {
    language: ttsLanguage,
    rate: 0.85,
    onError: (e) => console.warn('[TTS]', e),
  })
}

export function stop(): void {
  ExpoSpeech.stop()
}

export async function isSpeaking(): Promise<boolean> {
  return ExpoSpeech.isSpeakingAsync()
}