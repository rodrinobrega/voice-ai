<script setup lang="ts">
import { onMounted } from 'vue'
import { useTranscriptionsStore } from '~/stores/transcriptions'
import TranscriptionList from '~/components/TranscriptionList.vue'
import Pagination from '~/components/Pagination.vue'

definePageMeta({ middleware: ['auth'] })

const store = useTranscriptionsStore()

onMounted(() => {
  void store.loadFirstPage()
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-bold text-gray-900">Transcription history</h1>

    <p v-if="store.error" class="mb-4 text-sm text-red-600" data-testid="history-error">
      {{ store.error.message }}
    </p>

    <TranscriptionList :items="store.items" :loading="store.loading" />

    <Pagination
      :has-previous="store.hasPrevious"
      :has-next="store.hasNext"
      :loading="store.loading"
      @previous="store.loadPreviousPage"
      @next="store.loadNextPage"
    />
  </div>
</template>
