const COGNITO_ENDPOINT = '**/cognito-idp.*.amazonaws.com/'

function interceptCognitoTarget(target: string, body: Record<string, unknown>, alias: string): void {
  cy.intercept('POST', COGNITO_ENDPOINT, (req) => {
    if (req.headers['x-amz-target'] === `AWSCognitoIdentityProviderService.${target}`) {
      req.reply({ statusCode: 200, body })
    }
  }).as(alias)
}

describe('Auth: register -> confirm -> (login) -> logout', () => {
  const email = 'new.user@example.com'
  const password = 'SuperSecret123!'

  it('registers a new account and routes to the confirmation page', () => {
    interceptCognitoTarget('SignUp', { UserSub: 'user-123', UserConfirmed: false }, 'signUp')

    cy.visit('/register')
    cy.get('[data-testid="register-email"]').type(email)
    cy.get('[data-testid="register-password"]').type(password)
    cy.get('[data-testid="register-confirm-password"]').type(password)
    cy.get('[data-testid="register-submit"]').click()

    cy.wait('@signUp')
    cy.location('pathname').should('eq', '/confirm')
    cy.get('[data-testid="confirm-email"]').should('have.value', email)
  })

  it('confirms the emailed verification code and routes to login', () => {
    interceptCognitoTarget('ConfirmSignUp', {}, 'confirmSignUp')

    cy.visit(`/confirm?email=${encodeURIComponent(email)}`)
    cy.get('[data-testid="confirm-code"]').type('123456')
    cy.get('[data-testid="confirm-submit"]').click()

    cy.wait('@confirmSignUp')
    cy.location('pathname').should('eq', '/login')
  })

  // amazon-cognito-identity-js validates the SRP challenge-response
  // cryptographically on the client (`PASSWORD_VERIFIER`), so a plain HTTP
  // stub of InitiateAuth/RespondToAuthChallenge can never produce a
  // response the library will accept without a real user pool doing the
  // matching server-side math. Per ARCHITECTURE.md §11, real CI runs this
  // flow against an ephemeral `pr-{n}` Cognito pool for exactly that
  // reason. Here we instead seed the session the way `useAuth().login()`
  // would leave it (see `cypress/support/commands.ts`) and verify the rest
  // of the authenticated happy path, including a full logout.
  it('shows an authenticated header and logs out cleanly', () => {
    cy.intercept('GET', '**/transcriptions*', { items: [], nextCursor: null }).as('listTranscriptions')

    cy.visitAuthenticated('/history', email)
    cy.wait('@listTranscriptions')

    cy.contains(email).should('be.visible')
    cy.get('[data-testid="logout-button"]').click()

    cy.location('pathname').should('eq', '/login')
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('voice-ai.session')).to.be.null
    })
  })
})
