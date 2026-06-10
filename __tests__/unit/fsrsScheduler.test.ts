import { scheduleCard, previewIntervals, formatInterval, retrievability } from '../../src/fsrs/scheduler'
import type { FsrsState } from '../../src/db/schema'

const DAY_MS = 86_400_000

function newCardState(overrides: Partial<FsrsState> = {}): FsrsState {
  return {
    cardId:        'card-1',
    stability:     0,
    difficulty:    0,
    elapsedDays:   0,
    scheduledDays: 0,
    reps:          0,
    lapses:        0,
    state:         0, // New
    dueDate:       Date.now(),
    lastReview:    null,
    ...overrides,
  }
}

describe('formatInterval', () => {
  it('formats sub-day intervals', () => {
    expect(formatInterval(0)).toBe('<1d')
    expect(formatInterval(0.5)).toBe('<1d')
  })

  it('formats day intervals (1-6 days)', () => {
    expect(formatInterval(1)).toBe('1d')
    expect(formatInterval(6)).toBe('6d')
  })

  it('formats week intervals (7-29 days)', () => {
    expect(formatInterval(7)).toBe('1w')
    expect(formatInterval(14)).toBe('2w')
  })

  it('formats month intervals (30-364 days)', () => {
    expect(formatInterval(30)).toBe('1mo')
    expect(formatInterval(60)).toBe('2mo')
  })

  it('formats year intervals (365+ days)', () => {
    expect(formatInterval(365)).toBe('1.0y')
    expect(formatInterval(730)).toBe('2.0y')
  })
})

describe('retrievability', () => {
  it('is 0 for a brand-new card', () => {
    expect(retrievability(newCardState())).toBe(0)
  })

  it('is close to 1 immediately after review', () => {
    const state = newCardState({ stability: 5, reps: 1, lastReview: Date.now() })
    expect(retrievability(state)).toBeGreaterThan(0.99)
  })

  it('decays the longer it has been since the last review', () => {
    const now = Date.now()
    const recent = newCardState({ stability: 5, reps: 1, lastReview: now - 1 * DAY_MS })
    const old    = newCardState({ stability: 5, reps: 1, lastReview: now - 10 * DAY_MS })
    expect(retrievability(old)).toBeLessThan(retrievability(recent))
  })
})

describe('scheduleCard', () => {
  it('moves a new card out of the New state after a rating', () => {
    const next = scheduleCard(newCardState(), 3) // Good
    expect(next.cardId).toBe('card-1')
    expect(next.reps).toBe(1)
    expect(next.dueDate).toBeGreaterThan(Date.now())
  })

  it('schedules a longer (or equal) interval for "Easy" than "Again"', () => {
    const again = scheduleCard(newCardState(), 1)
    const easy  = scheduleCard(newCardState(), 4)
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(again.scheduledDays)
    expect(easy.dueDate).toBeGreaterThanOrEqual(again.dueDate)
  })

  it('increments lapses when a Review-state card is rated Again', () => {
    const reviewed = newCardState({
      stability: 10, difficulty: 5, reps: 3, state: 2, // Review
      elapsedDays: 5, scheduledDays: 10,
      lastReview: Date.now() - 5 * DAY_MS,
    })
    const next = scheduleCard(reviewed, 1) // Again
    expect(next.lapses).toBe(reviewed.lapses + 1)
  })
})

describe('previewIntervals', () => {
  it('returns an interval for each of the four ratings', () => {
    const preview = previewIntervals(newCardState())
    expect(preview).toHaveProperty('again')
    expect(preview).toHaveProperty('hard')
    expect(preview).toHaveProperty('good')
    expect(preview).toHaveProperty('easy')
  })

  it('schedules "again" no longer than "easy"', () => {
    const preview = previewIntervals(newCardState())
    expect(preview.again).toBeLessThanOrEqual(preview.easy)
  })

  it('does not mutate the underlying card (pure preview)', () => {
    const state = newCardState()
    previewIntervals(state)
    expect(state.reps).toBe(0)
    expect(state.state).toBe(0)
  })
})
