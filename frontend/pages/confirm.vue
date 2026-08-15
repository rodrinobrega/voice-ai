<script setup lang="ts">
import { ref } from 'vue'
import { navigateTo, useRoute } from '#app'
import { useAuth } from '~/composables/useAuth'
import { toDisplayError } from '~/types'

const route = useRoute()
const { confirmRegistration } = useAuth()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const code = ref('')
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

async function onSubmit(): Promise<void> {
  errorMessage.value = null
  successMessage.value = null
  isSubmitting.value = true
  try {
    await confirmRegistration(email.value, code.value)
    successMessage.value = 'Email confirmed. You can now log in.'
    await navigateTo('/login')
  } catch (err) {
    errorMessage.value = toDisplayError(err, 'Confirmation failed.').message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <h1 class="mb-2 text-2xl font-bold text-gray-900">Confirm your email</h1>
    <p class="mb-6 text-sm text-gray-500">
      Enter the verification code we sent to your email address.
    </p>
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
          data-testid="confirm-email"
        />
      </div>
      <div>
        <label class="form-label" for="code">Verification code</label>
        <input
          id="code"
          v-model="code"
          type="text"
          required
          inputmode="numeric"
          class="form-input"
          data-testid="confirm-code"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-red-600" data-testid="confirm-error">
        {{ errorMessage }}
      </p>
      <p v-if="successMessage" class="text-sm text-green-600" data-testid="confirm-success">
        {{ successMessage }}
      </p>
      <button type="submit" class="btn-primary w-full" :disabled="isSubmitting" data-testid="confirm-submit">
        {{ isSubmitting ? 'Confirming…' : 'Confirm' }}
      </button>
    </form>
  </div>
</template>
