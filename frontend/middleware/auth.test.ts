import { createPinia, setActivePinia } from 'pinia'
import authMiddleware from './auth'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const mockedNavigateTo = navigateTo as jest.MockedFunction<typeof navigateTo>

function route(path: string): Parameters<typeof authMiddleware>[0] {
  return { path } as Parameters<typeof authMiddleware>[0]
}

describe('auth middleware', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.sessionStorage.clear()
    jest.clearAllMocks()
  })

  it.each(['/login', '/register', '/confirm'])(
    'lets %s through without checking the session',
    (path) => {
      const result = authMiddleware(route(path), route('/'))

      expect(result).toBeUndefined()
      expect(mockedNavigateTo).not.toHaveBeenCalled()
    },
  )

  it('redirects to /login when there is no session for a protected route', () => {
    authMiddleware(route('/history'), route('/'))

    expect(mockedNavigateTo).toHaveBeenCalledWith('/login')
  })

  it('lets a protected route through when the session is valid', () => {
    const authStore = useAuthStore()
    authStore.setSession({
      idToken: 'id',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      email: 'user@example.com',
      userId: 'user-123',
    })

    const result = authMiddleware(route('/history'), route('/'))

    expect(result).toBeUndefined()
    expect(mockedNavigateTo).not.toHaveBeenCalled()
  })

  it('redirects to /login when the session has expired', () => {
    const authStore = useAuthStore()
    authStore.setSession({
      idToken: 'id',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1,
      email: 'user@example.com',
      userId: 'user-123',
    })

    authMiddleware(route('/upload'), route('/'))

    expect(mockedNavigateTo).toHaveBeenCalledWith('/login')
  })
})
