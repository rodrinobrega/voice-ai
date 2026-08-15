<script setup lang="ts">
defineProps<{
  hasPrevious: boolean
  hasNext: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'previous'): void
  (event: 'next'): void
}>()
</script>

<template>
  <div class="flex items-center justify-between pt-4">
    <button
      type="button"
      class="btn-secondary"
      data-testid="pagination-previous"
      :disabled="!hasPrevious || loading"
      @click="emit('previous')"
    >
      Previous
    </button>
    <button
      type="button"
      class="btn-secondary"
      data-testid="pagination-next"
      :disabled="!hasNext || loading"
      @click="emit('next')"
    >
      Next
    </button>
  </div>
</template>
