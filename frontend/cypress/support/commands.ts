/// <reference types="cypress" />

const SESSION_STORAGE_KEY = 'voice-ai.session'

/**
 * Seeds a valid Pinia auth session directly into `sessionStorage` before
 * the app boots, then visits `url`. This mirrors exactly what
 * `stores/auth.ts` persists after a real `useAuth().login()` call, without
 * requiring a live Cognito SRP handshake in the test (see the comment in
 * `cypress/e2e/auth.cy.ts` for why that can't be stubbed at the HTTP
 * layer).
 */
Cypress.Commands.add('visitAuthenticated', (url: string, email = 'user@example.com') => {
  const session = {
    idToken: 'fake-id-token',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    email,
    userId: 'user-123',
  }

  cy.visit(url, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    },
  })
})

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Seed sessionStorage with a valid auth session, then visit `url`. */
      visitAuthenticated(url: string, email?: string): Chainable<void>
    }
  }
}

export {}
