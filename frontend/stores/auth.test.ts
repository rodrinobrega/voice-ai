import { createPinia, setActivePinia } from 'pinia'
import type { CognitoUserSession } from 'amazon-cognito-identity-js'
import { useAuthStore } from './auth'
import { useAuth } from '~/composables/useAuth'

interface AuthCallbacks {
  onSuccess: (session: CognitoUserSession) => void
  onFailure: (err: Error) => void
}

const mockSignOut = jest.fn()
const mockGetCurrentUser = jest.fn(() => ({ signOut: mockSignOut }))
const mockAuthenticateUser = jest.fn<void, [unknown, AuthCallbacks]>()

// The whole `amazon-cognito-identity-js` client is mocked here — these
// tests exercise the useAuth()/authStore state-transition contract, not
// Cognito itself (which has no meaningful local emulator, per
// ARCHITECTURE.md §10).
jest.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: jest.fn().mockImplementation(() => ({
    getCurrentUser: mockGetCurrentUser,
  })),
  CognitoUser: jest.fn().mockImplementation(() => ({
    authenticateUser: mockAuthenticateUser,
  })),
  AuthenticationDetails: jest.fn(),
}))

const fakeCognitoSession = {
  getIdToken: () => ({ getJwtToken: () => 'fake-id-token' }),
  getAccessToken: () => ({
    getJwtToken: () => 'fake-access-token',
    getExpiration: () => Math.floor(Date.now() / 1000) + 3600,
    payload: { sub: 'user-123' },
  }),
  getRefreshToken: () => ({ getToken: () => 'fake-refresh-token' }),
} as unknown as CognitoUserSession

describe('auth store + useAuth (mocked Cognito client)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('has no session and is unauthenticated by default', () => {
    const store = useAuthStore()

    expect(store.isAuthenticated).toBe(false)
    expect(store.accessToken).toBeNull()
  })

  it('populates the store session on successful login', async () => {
    mockAuthenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess(fakeCognitoSession)
    })

    const { login } = useAuth()
    await login('user@example.com', 'Password123!')

    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(true)
    expect(store.accessToken).toBe('fake-access-token')
    expect(store.session?.userId).toBe('user-123')
    expect(store.email).toBe('user@example.com')
  })

  it('rejects and leaves the store unauthenticated when Cognito auth fails', async () => {
    mockAuthenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure(new Error('Incorrect username or password.'))
    })

    const { login } = useAuth()
    await expect(login('user@example.com', 'wrong-password')).rejects.toMatchObject({
      message: 'Incorrect username or password.',
    })

    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.session).toBeNull()
  })

  it('clears the store session and calls Cognito signOut on logout', async () => {
    mockAuthenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess(fakeCognitoSession)
    })

    const { login, logout } = useAuth()
    await login('user@example.com', 'Password123!')

    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(true)

    await logout()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(store.isAuthenticated).toBe(false)
    expect(store.session).toBeNull()
  })

  it('persists the session to sessionStorage (never localStorage)', async () => {
    mockAuthenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess(fakeCognitoSession)
    })

    const { login } = useAuth()
    await login('user@example.com', 'Password123!')

    const raw = window.sessionStorage.getItem('voice-ai.session')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({ accessToken: 'fake-access-token' })
  })

  it('ignores a malformed/tampered session already in sessionStorage on load', () => {
    // sessionStorage is client-writable — simulate a partially-overwritten
    // or corrupted record and confirm the store refuses to trust it rather
    // than starting up "authenticated" with garbage token values.
    window.sessionStorage.setItem('voice-ai.session', JSON.stringify({ accessToken: 'only-one-field' }))

    const store = useAuthStore()

    expect(store.isAuthenticated).toBe(false)
    expect(store.session).toBeNull()
  })

  it('ignores non-JSON garbage already in sessionStorage on load', () => {
    window.sessionStorage.setItem('voice-ai.session', 'not-valid-json{{{')

    const store = useAuthStore()

    expect(store.isAuthenticated).toBe(false)
    expect(store.session).toBeNull()
  })
})
