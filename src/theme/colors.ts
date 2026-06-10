/**
 * FlashCard App — Dark Theme
 *
 * One accent colour (violet-purple) across the whole app.
 * Everything else is white at descending opacity levels.
 *
 * Usage:
 *   import { Colors } from '@/theme/colors'
 *   style={{ backgroundColor: Colors.bg.base }}
 */

export const Colors = {
  // ─── Backgrounds ────────────────────────────────────────────────────────────
  bg: {
    base:    '#0f0f11',   // root screen background
    surface: '#1a1a1e',   // cards, list rows, modals
    elevated:'#222228',   // bottom sheets, dropdowns (one step above surface)
    input:   '#141416',   // text inputs
  },

  // ─── Borders ────────────────────────────────────────────────────────────────
  border: {
    subtle:  'rgba(255,255,255,0.06)',  // very faint dividers
    default: 'rgba(255,255,255,0.10)',  // card borders, section dividers
    strong:  'rgba(255,255,255,0.18)',  // focused inputs, active states
    accent:  'rgba(167,139,250,0.25)',  // card border after flip
  },

  // ─── Text ───────────────────────────────────────────────────────────────────
  text: {
    primary:   '#ffffff',                // main word, headings
    secondary: 'rgba(255,255,255,0.55)', // labels, deck names
    muted:     'rgba(255,255,255,0.30)', // metadata, timestamps
    faint:     'rgba(255,255,255,0.18)', // placeholders, disabled
    accent:    '#a78bfa',                // translation, active labels
  },

  // ─── Accent — violet-purple ──────────────────────────────────────────────────
  accent: {
    default: '#a78bfa',                  // primary accent
    dim:     'rgba(167,139,250,0.15)',   // pill backgrounds, subtle tints
    glow:    'rgba(167,139,250,0.08)',   // very faint background washes
    pressed: '#8b6ef0',                  // on press / active state
  },

  // ─── Rating buttons ──────────────────────────────────────────────────────────
  rating: {
    again: {
      bg:   '#2a1515',
      text: '#f09595',
      border: 'rgba(240,149,149,0.2)',
    },
    hard: {
      bg:   '#261f0f',
      text: '#FAC775',
      border: 'rgba(250,199,117,0.2)',
    },
    good: {
      bg:   '#0d2018',
      text: '#5DCAA5',
      border: 'rgba(93,202,165,0.2)',
    },
    easy: {
      bg:   '#0d1a2a',
      text: '#85B7EB',
      border: 'rgba(133,183,235,0.2)',
    },
  },

  // ─── Semantic colours ────────────────────────────────────────────────────────
  semantic: {
    success:     '#5DCAA5',
    successDim:  'rgba(93,202,165,0.15)',
    warning:     '#FAC775',
    warningDim:  'rgba(250,199,117,0.12)',
    error:       '#f09595',
    errorDim:    'rgba(240,149,149,0.12)',
    info:        '#85B7EB',
    infoDim:     'rgba(133,183,235,0.12)',
  },

  // ─── Gamification ───────────────────────────────────────────────────────────
  xp: {
    bar:      '#a78bfa',
    barTrack: 'rgba(255,255,255,0.07)',
    level:    'rgba(167,139,250,0.15)',
  },
  streak: {
    icon:  '#fbbf24',
    text:  '#fbbf24',
    bg:    'rgba(251,191,36,0.12)',
    border:'rgba(251,191,36,0.25)',
  },

  // ─── Activity heatmap ────────────────────────────────────────────────────────
  heatmap: {
    empty:  'rgba(255,255,255,0.05)',
    low:    'rgba(167,139,250,0.25)',
    mid:    'rgba(167,139,250,0.50)',
    high:   'rgba(167,139,250,0.85)',
  },

  // ─── Tab bar ─────────────────────────────────────────────────────────────────
  tab: {
    active:   '#a78bfa',
    inactive: 'rgba(255,255,255,0.30)',
    border:   'rgba(255,255,255,0.08)',
  },

  // ─── Part-of-speech pills ────────────────────────────────────────────────────
  pos: {
    noun:       { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa' },
    verb:       { bg: 'rgba(93,202,165,0.12)',  text: '#5DCAA5' },
    adjective:  { bg: 'rgba(133,183,235,0.12)', text: '#85B7EB' },
    phrase:     { bg: 'rgba(250,199,117,0.12)', text: '#FAC775' },
    other:      { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.45)' },
  },
} as const

// ─── Convenience re-exports ──────────────────────────────────────────────────

/** Use for StyleSheet.create() values that need to be strings */
export type ColorValue = string

/**
 * Returns the correct POS pill colours for a given part of speech.
 * Falls back to 'other' for unknown values.
 *
 * @example
 *   const { bg, text } = posColor('noun')
 */
export function posColor(pos: string): { bg: string; text: string } {
  const key = pos.toLowerCase() as keyof typeof Colors.pos
  return Colors.pos[key] ?? Colors.pos.other
}