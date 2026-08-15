<script setup lang="ts">
// Root component. Every route (auth pages included) renders through the
// shared AppHeader so nav/logout state stays consistent; page-level auth
// gating happens in `middleware/auth.ts`.
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppHeader />
    <main class="mx-auto max-w-5xl px-4 py-8">
      <NuxtPage />
    </main>
  </div>
</template>
