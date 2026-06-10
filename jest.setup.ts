/**
 * jest.setup.ts — runs once per test file, after the test framework is installed.
 */

// expo-router isn't mocked by jest-expo. Provide default navigation spies;
// individual tests can override return values via `(useRouter as jest.Mock).mockReturnValue(...)`.
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push:       jest.fn(),
    replace:    jest.fn(),
    back:       jest.fn(),
    canGoBack:  jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect:       jest.fn(),
  Link:  ({ children }: any) => children,
  Stack: { Screen: () => null },
}))
