<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const { logout } = useAuth()

const isLoggingOut = ref(false)
const userEmail = computed(() => authStore.email)

async function onLogout(): Promise<void> {
  isLoggingOut.value = true
  try {
    await logout()
  } finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <header class="border-b border-gray-200 bg-white">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
      <NuxtLink to="/" class="text-lg font-bold text-brand-700">Voice AI</NuxtLink>

      <nav v-if="authStore.isAuthenticated" class="flex items-center gap-4 text-sm">
        <NuxtLink to="/history" class="text-gray-600 hover:text-brand-700">History</NuxtLink>
        <NuxtLink to="/upload" class="text-gray-600 hover:text-brand-700">Upload</NuxtLink>
        <NuxtLink to="/record" class="text-gray-600 hover:text-brand-700">Record</NuxtLink>

        <span v-if="userEmail" class="hidden text-gray-400 sm:inline">{{ userEmail }}</span>

        <button
          type="button"
          class="btn-secondary"
          data-testid="logout-button"
          :disabled="isLoggingOut"
          @click="onLogout"
        >
          {{ isLoggingOut ? 'Logging out…' : 'Log out' }}
        </button>
      </nav>

      <nav v-else class="flex items-center gap-4 text-sm">
        <NuxtLink to="/login" class="text-gray-600 hover:text-brand-700">Log in</NuxtLink>
        <NuxtLink to="/register" class="btn-primary">Sign up</NuxtLink>
      </nav>
    </div>
  </header>
</template>
