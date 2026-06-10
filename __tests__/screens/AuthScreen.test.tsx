import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { useRouter } from 'expo-router'
import AuthScreen from '../../app/auth/index'
import { useAuth } from '../../src/context/AuthContext'
import { useDatabase } from '../../src/context/DatabaseContext'
import { pullAll, pushAll, isLocalEmpty } from '../../src/sync/syncService'
import { supabase } from '../../src/lib/supabase'

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../src/context/DatabaseContext', () => ({
  useDatabase: jest.fn(),
}))

jest.mock('../../src/sync/syncService', () => ({
  pullAll:      jest.fn(),
  pushAll:      jest.fn(),
  isLocalEmpty: jest.fn(),
}))

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}))

const mockUseAuth     = useAuth as jest.MockedFunction<typeof useAuth>
const mockUseDatabase = useDatabase as jest.MockedFunction<typeof useDatabase>
const mockIsLocalEmpty = isLocalEmpty as jest.MockedFunction<typeof isLocalEmpty>
const mockPullAll      = pullAll as jest.MockedFunction<typeof pullAll>
const mockPushAll      = pushAll as jest.MockedFunction<typeof pushAll>
const mockGetSession   = supabase.auth.getSession as jest.Mock

const FAKE_DB = {} as any

function setupAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockUseAuth.mockReturnValue({
    user:    null,
    session: null,
    loading: false,
    signIn:  jest.fn().mockResolvedValue(null),
    signUp:  jest.fn().mockResolvedValue(null),
    signOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

describe('AuthScreen', () => {
  let mockRouter: { push: jest.Mock; replace: jest.Mock; back: jest.Mock; canGoBack: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    mockUseDatabase.mockReturnValue({ db: FAKE_DB })
    mockIsLocalEmpty.mockResolvedValue(true)
    mockPullAll.mockResolvedValue(undefined)
    mockPushAll.mockResolvedValue(undefined)
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
  })

  it('renders the sign-in form by default', async () => {
    setupAuth()
    await render(<AuthScreen />)

    expect(screen.getByText('Welcome back')).toBeOnTheScreen()
    expect(screen.getByPlaceholderText('you@example.com')).toBeOnTheScreen()
    expect(screen.getByPlaceholderText('Min. 6 characters')).toBeOnTheScreen()
    expect(screen.getByText('Sign in')).toBeOnTheScreen()
  })

  it('shows a validation error when submitting empty fields', async () => {
    const signIn = jest.fn()
    setupAuth({ signIn })
    await render(<AuthScreen />)

    await fireEvent.press(screen.getByText('Sign in'))

    expect(screen.getByText('Please enter your email and password.')).toBeOnTheScreen()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('toggles between sign-in and sign-up modes', async () => {
    setupAuth()
    await render(<AuthScreen />)

    await fireEvent.press(screen.getByText('Sign up'))

    expect(screen.getAllByText('Create account')).toHaveLength(2) // header title + submit button
    expect(screen.getByText('Sign in')).toBeOnTheScreen() // toggle link back to sign-in
  })

  it('signs in, pulls remote data on a fresh device, and navigates into the app', async () => {
    const signIn = jest.fn().mockResolvedValue(null)
    setupAuth({ signIn })
    mockIsLocalEmpty.mockResolvedValue(true)

    await render(<AuthScreen />)

    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await fireEvent.changeText(screen.getByPlaceholderText('Min. 6 characters'), 'password123')
    await fireEvent.press(screen.getByText('Sign in'))

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)'))

    expect(signIn).toHaveBeenCalledWith('test@example.com', 'password123')
    expect(mockPullAll).toHaveBeenCalledWith(FAKE_DB, 'user-1')
    expect(mockPushAll).not.toHaveBeenCalled()
  })

  it('pushes local data for an account that already has data on the server', async () => {
    const signIn = jest.fn().mockResolvedValue(null)
    setupAuth({ signIn })
    mockIsLocalEmpty.mockResolvedValue(false)

    await render(<AuthScreen />)

    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await fireEvent.changeText(screen.getByPlaceholderText('Min. 6 characters'), 'password123')
    await fireEvent.press(screen.getByText('Sign in'))

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)'))

    expect(mockPushAll).toHaveBeenCalledWith(FAKE_DB, 'user-1')
    expect(mockPullAll).not.toHaveBeenCalled()
  })

  it('shows the error message returned by signIn and does not navigate', async () => {
    const signIn = jest.fn().mockResolvedValue('Invalid login credentials')
    setupAuth({ signIn })

    await render(<AuthScreen />)

    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await fireEvent.changeText(screen.getByPlaceholderText('Min. 6 characters'), 'wrongpass')
    await fireEvent.press(screen.getByText('Sign in'))

    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeOnTheScreen())
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('calls signUp instead of signIn in sign-up mode', async () => {
    const signUp = jest.fn().mockResolvedValue(null)
    const signIn = jest.fn()
    setupAuth({ signUp, signIn })

    await render(<AuthScreen />)
    await fireEvent.press(screen.getByText('Sign up'))

    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'new@example.com')
    await fireEvent.changeText(screen.getByPlaceholderText('Min. 6 characters'), 'password123')
    await fireEvent.press(screen.getAllByText('Create account')[1])

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)'))
    expect(signUp).toHaveBeenCalledWith('new@example.com', 'password123')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('redirects immediately if a user is already signed in', async () => {
    setupAuth({ user: { id: 'user-1' } as any })

    await render(<AuthScreen />)

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)'))
  })
})
