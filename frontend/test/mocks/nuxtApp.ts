/**
 * Hand-written stand-in for Nuxt's `#app` alias, used only under Jest
 * (mapped via `moduleNameMapper` in jest.config.js). Real Nuxt provides
 * `useRuntimeConfig`, `navigateTo`, `useRoute`, `useRouter` and
 * `defineNuxtRouteMiddleware` at build time; outside of a real Nuxt build
 * (as in this sandbox/Jest) they need an explicit mock implementation.
 */

export const navigateTo = jest.fn(async (to: string) => to)

export const useRuntimeConfig = jest.fn(() => ({
  public: {
    apiBase: 'http://localhost:3001',
    cognitoUserPoolId: 'eu-west-1_test',
    cognitoClientId: 'test-client-id',
    awsRegion: 'eu-west-1',
  },
}))

export const useRoute = jest.fn(() => ({
  path: '/',
  query: {},
  params: {},
}))

export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  currentRoute: { value: useRoute() },
}))

type RouteLocation = { path: string }
type MiddlewareFn = (to: RouteLocation, from: RouteLocation) => unknown

export function defineNuxtRouteMiddleware(fn: MiddlewareFn): MiddlewareFn {
  return fn
}
