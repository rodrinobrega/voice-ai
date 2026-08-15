<script setup lang="ts">
import { computed, ref } from 'vue'
import { navigateTo } from '#app'
import { useAuth } from '~/composables/useAuth'
import { toDisplayError } from '~/types'

const { register } = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)

const passwordsMatch = computed(() => password.value === confirmPassword.value)

async function onSubmit(): Promise<void> {
  errorMessage.value = null
  if (!passwordsMatch.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  isSubmitting.value = true
  try {
    await register(email.value, password.value)
    await navigateTo(`/confirm?email=${encodeURIComponent(email.value)}`)
  } catch (err) {
    errorMessage.value = toDisplayError(err, 'Registration failed.').message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <h1 class="mb-6 text-2xl font-bold text-gray-900">Create an account</h1>
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
          data-testid="register-email"
        />
      </div>
      <div>
        <label class="form-label" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="new-password"
          class="form-input"
          data-testid="register-password"
        />
        <p class="mt-1 text-xs text-gray-400">Min 12 characters, upper/lower case, number and symbol.</p>
      </div>
      <div>
        <label class="form-label" for="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
          class="form-input"
          data-testid="register-confirm-password"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-red-600" data-testid="register-error">
        {{ errorMessage }}
      </p>
      <button type="submit" class="btn-primary w-full" :disabled="isSubmitting" data-testid="register-submit">
        {{ isSubmitting ? 'Creating account…' : 'Sign up' }}
      </button>
    </form>
    <p class="mt-4 text-sm text-gray-500">
      Already have an account? <NuxtLink to="/login" class="text-brand-600">Log in</NuxtLink>
    </p>
  </div>
</template>
