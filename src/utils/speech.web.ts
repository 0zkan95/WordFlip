/**
 * src/utils/speech.web.ts — web only
 *
 * Metro picks this file on web instead of speech.ts.
 * Uses the browser's built-in Web Speech API — no expo-speech imported.
 */

export function speak(text: string, language?: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance    = new SpeechSynthesisUtterance(text)
  utterance.rate     = 0.85
  if (language) utterance.lang = language
  window.speechSynthesis.speak(utterance)
}

export function stop(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

export async function isSpeaking(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  return window.speechSynthesis.speaking
}