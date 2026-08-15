// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Static SPA build per ARCHITECTURE.md ("§2 Frontend hosting": S3 + CloudFront,
  // no SSR-on-Lambda since the app is entirely behind auth after login/landing).
  ssr: false,

  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false, // run via `npm run typecheck` (nuxi typecheck) instead of per-dev-build
  },

  app: {
    head: {
      title: 'Voice AI',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Voice AI — audio transcription platform' },
      ],
    },
  },

  runtimeConfig: {
    // No private/server-only keys: this SPA has no Nuxt server runtime in
    // production (static generate), so nothing sensitive belongs here.
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001',
      cognitoUserPoolId: process.env.NUXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
      cognitoClientId: process.env.NUXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
      awsRegion: process.env.NUXT_PUBLIC_AWS_REGION ?? 'eu-west-1',
    },
  },

  compatibilityDate: '2024-08-14',
})
