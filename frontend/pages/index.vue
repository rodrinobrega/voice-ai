<script setup lang="ts">
import { navigateTo } from '#app'

// `middleware/auth.ts` already guarantees an authenticated session reaches
// this page (it's not in the public-routes allowlist); the only thing left
// to do is send the user straight to their history.
definePageMeta({ middleware: ['auth'] })

await navigateTo('/history')
</script>

<template>
  <p class="text-sm text-gray-500">Redirecting…</p>
</template>
