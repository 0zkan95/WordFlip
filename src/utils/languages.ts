/**
 * src/utils/languages.ts
 *
 * Maps the app's short deck language codes (ISO 639-1, e.g. 'de', 'ja')
 * to full BCP-47 locale codes (e.g. 'de-DE', 'ja-JP') expected by
 * expo-speech, expo-speech-recognition, and the Web Speech API.
 */

const LANG_MAP: Record<string, string> = {
  en: 'en-US', de: 'de-DE', ja: 'ja-JP', fr: 'fr-FR',
  es: 'es-ES', it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU',
  ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', hi: 'hi-IN',
  tr: 'tr-TR', pl: 'pl-PL', nl: 'nl-NL', sr: 'sr-RS',
}

export function toBCP47(short: string | undefined): string {
  return LANG_MAP[short?.toLowerCase() ?? ''] ?? 'en-US'
}
