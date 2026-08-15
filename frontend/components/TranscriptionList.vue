<script setup lang="ts">
import type { Transcription } from '~/types'
import TranscriptionRow from '~/components/TranscriptionRow.vue'

defineProps<{
  items: Transcription[]
  loading: boolean
}>()
</script>

<template>
  <div class="card overflow-x-auto">
    <table v-if="items.length > 0" class="w-full text-left">
      <thead>
        <tr class="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
          <th class="px-4 py-2 font-medium">Name</th>
          <th class="px-4 py-2 font-medium">Type</th>
          <th class="px-4 py-2 font-medium">Created</th>
          <th class="px-4 py-2 font-medium">Status</th>
          <th class="px-4 py-2 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <TranscriptionRow
          v-for="item in items"
          :key="item.transcriptionId"
          :transcription="item"
        />
      </tbody>
    </table>

    <p v-else-if="!loading" class="py-8 text-center text-sm text-gray-500" data-testid="empty-state">
      No transcriptions yet. Upload a file or record something to get started.
    </p>

    <p v-if="loading" class="py-8 text-center text-sm text-gray-500" data-testid="loading-state">
      Loading…
    </p>
  </div>
</template>
