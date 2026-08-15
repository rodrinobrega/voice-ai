/**
 * Hand-written ambient declarations for the small slice of Nuxt 3's
 * auto-generated `.nuxt/imports.d.ts` / `.nuxt/nuxt.d.ts` that this project
 * relies on. A real `nuxi prepare`/`nuxi dev` run generates these
 * automatically; since this sandbox never runs the Nuxt CLI, they're
 * authored by hand so the rest of the codebase type-checks the same way it
 * would in a normal Nuxt workspace.
 */

export {}

declare global {
  /**
   * Nuxt's global fetch client (a pre-configured `ofetch` instance),
   * normally auto-imported. Used directly (without an explicit import) in
   * `composables/useApi.ts`, matching idiomatic Nuxt usage.
   */
  const $fetch: <T = unknown>(
    request: string,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
      baseURL?: string
      body?: unknown
      query?: Record<string, string | number | undefined>
      headers?: Record<string, string>
    },
  ) => Promise<T>

  /**
   * Nuxt page-level compiler macro. It is compiled away by Nuxt's build
   * tooling and never actually executes at runtime, so it is declared only
   * for type-checking purposes here.
   */
  function definePageMeta(meta: {
    middleware?: string | string[]
    layout?: string | false
    [key: string]: unknown
  }): void
}
