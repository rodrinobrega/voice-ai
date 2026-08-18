import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type ICognitoUserPoolData,
} from 'amazon-cognito-identity-js'
import { navigateTo, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/stores/auth'
import type { AppError } from '~/types'

interface CognitoErrorLike {
  message?: string
  code?: string
  name?: string
}

function toAppError(err: unknown): AppError {
  const cognitoErr = err as CognitoErrorLike
  return {
    message: cognitoErr?.message ?? 'Authentication request failed.',
    code: cognitoErr?.code ?? cognitoErr?.name,
  }
}

/**
 * Builds a fresh CognitoUserPool per call. `Storage` is pinned to
 * `sessionStorage` because amazon-cognito-identity-js otherwise defaults to
 * `window.localStorage` for its own internal token cache — the frontend
 * spec forbids localStorage entirely, so we override it explicitly.
 */
function getUserPool(): CognitoUserPool {
  const config = useRuntimeConfig()
  const poolData: ICognitoUserPoolData = {
    UserPoolId: config.public.cognitoUserPoolId,
    ClientId: config.public.cognitoClientId,
    Storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  }
  return new CognitoUserPool(poolData)
}

export interface AuthApi {
  register: (email: string, password: string) => Promise<void>
  confirmRegistration: (email: string, code: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

/**
 * Wraps `amazon-cognito-identity-js` for the three auth use cases. No
 * custom backend endpoint is involved — the SPA talks to Cognito directly,
 * per ARCHITECTURE.md §4.1.
 */
export function useAuth(): AuthApi {
  const authStore = useAuthStore()

  function register(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const attributeList = [new CognitoUserAttribute({ Name: 'email', Value: email })]
      getUserPool().signUp(email, password, attributeList, [], (err) => {
        if (err) {
          reject(toAppError(err))
          return
        }
        resolve()
      })
    })
  }

  function confirmRegistration(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: getUserPool() })
      user.confirmRegistration(code, true, (err) => {
        if (err) {
          reject(toAppError(err))
          return
        }
        resolve()
      })
    })
  }

  function login(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: getUserPool() })
      const details = new AuthenticationDetails({ Username: email, Password: password })

      user.authenticateUser(details, {
        onSuccess: (session: CognitoUserSession) => {
          const sub = session.getAccessToken().payload.sub
          authStore.setSession({
            idToken: session.getIdToken().getJwtToken(),
            accessToken: session.getAccessToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
            expiresAt: session.getAccessToken().getExpiration() * 1000,
            email,
            userId: typeof sub === 'string' ? sub : '',
          })
          resolve()
        },
        onFailure: (err) => reject(toAppError(err)),
      })
    })
  }

  async function logout(): Promise<void> {
    const currentUser = getUserPool().getCurrentUser()
    currentUser?.signOut()
    authStore.clearSession()
    await navigateTo('/login')
  }

  return { register, confirmRegistration, login, logout }
}
