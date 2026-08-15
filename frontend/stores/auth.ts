import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthSession } from '~/types'

/**
 * Session persistence is intentionally in-memory (this store's reactive
 * state) plus `sessionStorage` only — never `localStorage` — per
 * ARCHITECTURE.md §6.3 ("Frontend token storage") and the exercise's
 * security requirements. sessionStorage is tab-scoped and cleared when the
 * tab closes, which keeps a page reload from forcing a re-login without
 * giving tokens the effectively-unlimited lifetime `localStorage` would.
 */
const SESSION_STORAGE_KEY = 'voice-ai.session'

/**
 * `sessionStorage` is client-writable — by another script on the page, or
 * by hand in devtools — so its contents are treated as untrusted input,
 * not blindly cast. A malformed/tampered record is dropped (treated as
 * "no session") rather than trusted as-is.
 */
function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.idToken === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.email === 'string' &&
    typeof candidate.userId === 'string'
  )
}

function readPersistedSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isAuthSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

function persistSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return
  if (session) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } else {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(readPersistedSession())

  const isAuthenticated = computed<boolean>(
    () => session.value !== null && session.value.expiresAt > Date.now(),
  )
  const accessToken = computed<string | null>(() => session.value?.accessToken ?? null)
  const email = computed<string | null>(() => session.value?.email ?? null)

  function setSession(newSession: AuthSession): void {
    session.value = newSession
    persistSession(newSession)
  }

  function clearSession(): void {
    session.value = null
    persistSession(null)
  }

  return { session, isAuthenticated, accessToken, email, setSession, clearSession }
})
