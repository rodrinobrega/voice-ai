import { defineNuxtRouteMiddleware, navigateTo } from '#app'
import { useAuthStore } from '~/stores/auth'

/**
 * Named (non-global) middleware, per the required filename
 * `middleware/auth.ts` — every protected page opts in explicitly via
 * `definePageMeta({ middleware: ['auth'] })` (`index`, `history`, `upload`,
 * `record`). `login`/`register`/`confirm` intentionally don't, since they
 * must stay reachable while signed out. The PUBLIC_ROUTES allowlist below
 * is a second line of defense in case this middleware is ever promoted to
 * `auth.global.ts` (applied to every route automatically) later.
 */
const PUBLIC_ROUTES = new Set(['/login', '/register', '/confirm'])

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC_ROUTES.has(to.path)) {
    return undefined
  }

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    return navigateTo('/login')
  }

  return undefined
})
