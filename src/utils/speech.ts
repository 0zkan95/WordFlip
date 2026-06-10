/**
 * src/utils/speech.ts — native (iOS / Android)
 * Uses expo-speech which calls the OS TTS engine.
 */
import * as ExpoSpeech from 'expo-speech'

export function speak(text: string, language?: string): void {
  ExpoSpeech.stop()
  ExpoSpeech.speak(text, {
    language,
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