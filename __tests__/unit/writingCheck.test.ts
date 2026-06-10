import { checkAnswer } from '../../src/components/WritingExerciseCard'

describe('checkAnswer', () => {
  describe('correct answers', () => {
    it('matches an identical string', () => {
      expect(checkAnswer('Hund', 'Hund')).toBe('correct')
    })

    it('is case-insensitive', () => {
      expect(checkAnswer('hund', 'Hund')).toBe('correct')
    })

    it('ignores leading/trailing whitespace', () => {
      expect(checkAnswer('  Hund  ', 'Hund')).toBe('correct')
    })
  })

  describe('empty input', () => {
    it('is wrong for an empty string', () => {
      expect(checkAnswer('', 'Hund')).toBe('wrong')
    })

    it('is wrong for whitespace-only input', () => {
      expect(checkAnswer('   ', 'Hund')).toBe('wrong')
    })
  })

  describe('typo tolerance', () => {
    it('gives no tolerance for short words (< 5 chars)', () => {
      // 'Hund' (4 chars) -> tolerance = floor(4/5) = 0
      expect(checkAnswer('Hunt', 'Hund')).toBe('wrong')
    })

    it('allows a single typo for 5+ char words', () => {
      // 'Hause' (5 chars) -> tolerance = floor(5/5) = 1
      expect(checkAnswer('Hauze', 'Hause')).toBe('close')
      expect(checkAnswer('Haus', 'Hause')).toBe('close')
    })

    it('caps tolerance at 2 for long words', () => {
      // 'Freundlich' (10 chars) -> tolerance = min(2, floor(10/5)) = 2
      expect(checkAnswer('Freundlick', 'Freundlich')).toBe('close') // 1 typo
      expect(checkAnswer('Freundlixk', 'Freundlich')).toBe('close') // 2 typos
    })

    it('is wrong once typos exceed the tolerance', () => {
      // 'Freundlich' (10 chars) -> tolerance = 2, but this has 4+ differences
      expect(checkAnswer('Xyzendlich', 'Freundlich')).toBe('wrong')
      // Completely different word
      expect(checkAnswer('Katze', 'Hause')).toBe('wrong')
    })
  })
})
