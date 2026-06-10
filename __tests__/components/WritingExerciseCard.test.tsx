import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import WritingExerciseCard from '../../src/components/WritingExerciseCard'
import type { StudyCard } from '../../src/db/queries'

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id:                  'card-1',
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
    fsrs: {
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
    },
    ...overrides,
  }
}

describe('WritingExerciseCard', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(async () => {
    await act(() => { jest.runOnlyPendingTimers() })
    jest.useRealTimers()
  })

  const PLACEHOLDER = 'Type your answer…'

  it('shows the back of the card as the prompt and the progress', async () => {
    await render(
      <WritingExerciseCard card={makeCard()} current={2} total={5} onNext={jest.fn()} onSkip={jest.fn()} />
    )
    expect(screen.getByText('dog')).toBeOnTheScreen()
    expect(screen.getByText('2 / 5')).toBeOnTheScreen()
  })

  it('disables Check until the user types something', async () => {
    await render(
      <WritingExerciseCard card={makeCard()} current={1} total={1} onNext={jest.fn()} onSkip={jest.fn()} />
    )
    expect(screen.getByText('Check')).toBeDisabled()

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Hund')
    expect(screen.getByText('Check')).toBeEnabled()
  })

  it('shows "Correct!" feedback for an exact match', async () => {
    await render(
      <WritingExerciseCard card={makeCard()} current={1} total={3} onNext={jest.fn()} onSkip={jest.fn()} />
    )

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Hund')
    await fireEvent.press(screen.getByText('Check'))

    expect(screen.getByText('Correct!')).toBeOnTheScreen()
    expect(screen.getByText('Next')).toBeOnTheScreen()
  })

  it('shows "Not quite" feedback and the correct answer for a wrong guess', async () => {
    await render(
      <WritingExerciseCard card={makeCard()} current={1} total={3} onNext={jest.fn()} onSkip={jest.fn()} />
    )

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Katze')
    await fireEvent.press(screen.getByText('Check'))

    expect(screen.getByText('Not quite')).toBeOnTheScreen()
    expect(screen.getByText(/Hund/)).toBeOnTheScreen()
  })

  it('shows "Close enough" feedback for a near-miss on a longer word', async () => {
    const card = makeCard({ front: 'Freundlich' })
    await render(<WritingExerciseCard card={card} current={1} total={3} onNext={jest.fn()} onSkip={jest.fn()} />)

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Freundlick')
    await fireEvent.press(screen.getByText('Check'))

    expect(screen.getByText('Close enough')).toBeOnTheScreen()
  })

  it('calls onNext with the result when the next button is pressed', async () => {
    const onNext = jest.fn()
    await render(<WritingExerciseCard card={makeCard()} current={1} total={3} onNext={onNext} onSkip={jest.fn()} />)

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Hund')
    await fireEvent.press(screen.getByText('Check'))
    await fireEvent.press(screen.getByText('Next'))

    expect(onNext).toHaveBeenCalledWith('correct')
  })

  it('shows "Finish" instead of "Next" on the last card', async () => {
    await render(<WritingExerciseCard card={makeCard()} current={3} total={3} onNext={jest.fn()} onSkip={jest.fn()} />)

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Hund')
    await fireEvent.press(screen.getByText('Check'))

    expect(screen.getByText('Finish')).toBeOnTheScreen()
  })

  it('calls onSkip when "Skip round" is pressed', async () => {
    const onSkip = jest.fn()
    await render(<WritingExerciseCard card={makeCard()} current={1} total={3} onNext={jest.fn()} onSkip={onSkip} />)

    await fireEvent.press(screen.getByText('Skip round'))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('resets the input and result when moving to a new card', async () => {
    const { rerender } = await render(
      <WritingExerciseCard card={makeCard()} current={1} total={2} onNext={jest.fn()} onSkip={jest.fn()} />
    )

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Hund')
    await fireEvent.press(screen.getByText('Check'))
    expect(screen.getByText('Correct!')).toBeOnTheScreen()

    const nextCard = makeCard({ id: 'card-2', front: 'Katze', back: 'cat' })
    await rerender(
      <WritingExerciseCard card={nextCard} current={2} total={2} onNext={jest.fn()} onSkip={jest.fn()} />
    )

    expect(screen.queryByText('Correct!')).toBeNull()
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveProp('value', '')
    expect(screen.getByText('cat')).toBeOnTheScreen()
  })
})
