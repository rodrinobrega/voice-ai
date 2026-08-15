import { navigateTo, useRuntimeConfig } from '#app'
import { useAuthStore } from '~/stores/auth'
import type { AppError } from '~/types'

const HTTP_UNAUTHORIZED = 401

type QueryParams = Record<string, string | number | undefined>
type Body = Record<string, unknown> | undefined

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: Body
  query?: QueryParams
}

export interface ApiClient {
  get: <T>(path: string, query?: QueryParams) => Promise<T>
  post: <T>(path: string, body?: Body) => Promise<T>
}

interface FetchError {
  statusCode?: number
  response?: { status?: number }
  data?: { message?: string }
  message?: string
}

function isFetchError(err: unknown): err is FetchError {
  return typeof err === 'object' && err !== null
}

function isUnauthorized(err: unknown): boolean {
  if (!isFetchError(err)) return false
  return err.statusCode === HTTP_UNAUTHORIZED || err.response?.status === HTTP_UNAUTHORIZED
}

function toAppError(err: unknown): AppError {
  if (isFetchError(err)) {
    return {
      message: err.data?.message ?? err.message ?? 'Request failed',
      code: err.statusCode !== undefined ? String(err.statusCode) : undefined,
    }
  }
  return { message: 'Request failed' }
}

/**
 * Thin wrapper around Nuxt's global `$fetch` that:
 *  - prefixes every call with `NUXT_PUBLIC_API_BASE`,
 *  - attaches the Cognito access token as `Authorization: Bearer …`,
 *  - clears the session and redirects to /login on a 401 response.
 * Not used for the S3 presigned upload (different origin, unauthenticated)
 * or the Speechmatics real-time WebSocket — see FileUploader/useMicRecorder.
 */
export function useApi(): ApiClient {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await $fetch<T>(path, {
        baseURL: config.public.apiBase,
        method: options.method ?? 'GET',
        body: options.body,
        query: options.query,
        headers: authStore.accessToken
          ? { Authorization: `Bearer ${authStore.accessToken}` }
          : undefined,
      })
    } catch (err) {
      if (isUnauthorized(err)) {
        authStore.clearSession()
        await navigateTo('/login')
      }
      throw toAppError(err)
    }
  }

  return {
    get: <T>(path: string, query?: QueryParams): Promise<T> => request<T>(path, { method: 'GET', query }),
    post: <T>(path: string, body?: Body): Promise<T> => request<T>(path, { method: 'POST', body }),
  }
}
