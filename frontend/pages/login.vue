<script setup lang="ts">
import { ref } from 'vue'
import { navigateTo } from '#app'
import { useAuth } from '~/composables/useAuth'
import { toDisplayError } from '~/types'

const { login } = useAuth()

const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(): Promise<void> {
  errorMessage.value = null
  isSubmitting.value = true
  try {
    await login(email.value, password.value)
    await navigateTo('/history')
  } catch (err) {
    errorMessage.value = toDisplayError(err, 'Login failed.').message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <h1 class="mb-6 text-2xl font-bold text-gray-900">Log in</h1>
    <form class="card space-y-4" @submit.prevent="onSubmit">
      <div>
        <label class="form-label" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="form-input"
          data-testid="login-email"
        />
      </div>
      <div>
        <label class="form-label" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="form-input"
          data-testid="login-password"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-red-600" data-testid="login-error">
        {{ errorMessage }}
      </p>
      <button type="submit" class="btn-primary w-full" :disabled="isSubmitting" data-testid="login-submit">
        {{ isSubmitting ? 'Logging in…' : 'Log in' }}
      </button>
    </form>
    <p class="mt-4 text-sm text-gray-500">
      No account? <NuxtLink to="/register" class="text-brand-600">Register</NuxtLink>
    </p>
  </div>
</template>
