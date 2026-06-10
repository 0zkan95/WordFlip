import { renderHook, waitFor, act } from '@testing-library/react-native'
import { useStudySession } from '../../src/hooks/useStudySession'
import { getDueCards, saveReview } from '../../src/db/queries'
import { scheduleCard } from '../../src/fsrs/scheduler'
import type { StudyCard } from '../../src/db/queries'
import type { FsrsState, Rating } from '../../src/db/schema'
import type * as SQLite from 'expo-sqlite'

jest.mock('../../src/db/queries')
jest.mock('../../src/fsrs/scheduler')

const mockGetDueCards = getDueCards as jest.MockedFunction<typeof getDueCards>
const mockSaveReview = saveReview as jest.MockedFunction<typeof saveReview>
const mockScheduleCard = scheduleCard as jest.MockedFunction<typeof scheduleCard>

const FAKE_DB = {} as SQLite.SQLiteDatabase

function makeFsrs(overrides: Partial<FsrsState> = {}): FsrsState {
  return {
    cardId:        'card-1',
    stability:     0,
    difficulty:    0,
    elapsedDays:   0,
    scheduledDays: 0,
    reps:          0,
    lapses:        0,
    state:         0,
    dueDate:       Date.now(),
    lastReview:    null,
    ...overrides,
  }
}

function makeStudyCard(overrides: Partial<StudyCard> = {}): StudyCard {
  const id = overrides.id ?? 'card-1'
  return {
    id,
    deckId:              'deck-1',
    front:               'Hund',
    back:                'dog',
    example:             null,
    exampleTranslation:  null,
    notes:               null,
    cardType:            'noun',
    imageUri:            null,
    isSuspended:         false,
    studyBothDirections: false,
    createdAt:           Date.now(),
    updatedAt:           Date.now(),
    isReversed:          false,
    fsrs: makeFsrs({ cardId: id }),
    ...overrides,
  }
}

const NO_EVENTS = { leveledUp: false, newLevel: 0, streakMilestone: null, xpMilestone: null }

beforeEach(() => {
  jest.clearAllMocks()
  mockScheduleCard.mockImplementation((fsrs: FsrsState, _rating: Rating) => ({ ...fsrs, reps: fsrs.reps + 1 }))
  mockSaveReview.mockResolvedValue(NO_EVENTS)
})

describe('useStudySession', () => {
  it('loads due cards and exposes the first entry', async () => {
    const cardA = makeStudyCard({ id: 'a' })
    const cardB = makeStudyCard({ id: 'b' })
    mockGetDueCards.mockResolvedValue([cardA, cardB])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDone).toBe(false)
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.progress).toEqual({ done: 0, total: 2 })
    expect(['a', 'b']).toContain(result.current.currentEntry?.card.id)
  })

  it('finishes immediately with an empty summary when there are no due cards', async () => {
    mockGetDueCards.mockResolvedValue([])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDone).toBe(true)
    expect(result.current.currentEntry).toBeNull()
    expect(result.current.summary).toEqual({ totalCards: 0, correct: 0, again: 0, totalTimeMs: 0, xpEarned: 0 })
  })

  it('rate() saves the review and advances to the next entry', async () => {
    const cardA = makeStudyCard({ id: 'a' })
    const cardB = makeStudyCard({ id: 'b' })
    mockGetDueCards.mockResolvedValue([cardA, cardB])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const firstId = result.current.currentEntry?.card.id

    await act(async () => {
      await result.current.rate(3) // Good
    })

    expect(mockSaveReview).toHaveBeenCalledTimes(1)
    expect(mockSaveReview.mock.calls[0][1].rating).toBe(3)
    expect(result.current.progress).toEqual({ done: 1, total: 2 })
    expect(result.current.currentEntry?.card.id).not.toBe(firstId)
    expect(result.current.isDone).toBe(false)
  })

  it('rate() on the last card finishes the session with a summary', async () => {
    const card = makeStudyCard({ id: 'a' })
    mockGetDueCards.mockResolvedValue([card])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.rate(4) // Easy
    })

    expect(result.current.isDone).toBe(true)
    expect(result.current.currentEntry).toBeNull()
    expect(result.current.summary).toMatchObject({ totalCards: 1, correct: 1, again: 0, xpEarned: 20 })
  })

  it('counts an "Again" rating towards the again total and not correct', async () => {
    const card = makeStudyCard({ id: 'a' })
    mockGetDueCards.mockResolvedValue([card])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.rate(1) // Again
    })

    expect(result.current.summary).toMatchObject({ totalCards: 1, correct: 0, again: 1, xpEarned: 5 })
  })

  it('records pending milestone events from saveReview and clears them on demand', async () => {
    const card = makeStudyCard({ id: 'a' })
    mockGetDueCards.mockResolvedValue([card])
    mockSaveReview.mockResolvedValue({ leveledUp: true, newLevel: 5, streakMilestone: 7, xpMilestone: null })

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.rate(3)
    })

    expect(result.current.pendingEvents).toHaveLength(1)
    expect(result.current.pendingEvents[0]).toMatchObject({ leveledUp: true, newLevel: 5, streakMilestone: 7 })

    await act(async () => {
      result.current.clearPendingEvents()
    })

    expect(result.current.pendingEvents).toHaveLength(0)
  })

  it('reset() reloads the due cards and recomputes the session', async () => {
    mockGetDueCards.mockResolvedValueOnce([])

    const { result } = await renderHook(() => useStudySession('deck-1', FAKE_DB))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDone).toBe(true)

    const card = makeStudyCard({ id: 'a' })
    mockGetDueCards.mockResolvedValueOnce([card])

    await act(async () => {
      result.current.reset()
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockGetDueCards).toHaveBeenCalledTimes(2)
    expect(result.current.isDone).toBe(false)
    expect(result.current.currentEntry?.card.id).toBe('a')
  })
})
