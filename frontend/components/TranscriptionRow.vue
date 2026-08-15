<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { toDisplayError, type DownloadUrlResponse, type Transcription } from '~/types'

const props = defineProps<{ transcription: Transcription }>()

// The download URL comes from our own authenticated API (an S3 presigned
// GET), but it's still an external string we're about to hand straight to
// `window.location.href` — defense in depth against ever navigating to a
// non-`https:` URL (e.g. `javascript:`), however that string got there.
const SAFE_DOWNLOAD_URL_PATTERN = /^https:\/\//

const api = useApi()
const isDownloading = ref(false)
const downloadError = ref<string | null>(null)

const STATUS_STYLES: Record<Transcription['status'], string> = {
  PENDING_UPLOAD: 'bg-gray-100 text-gray-700',
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
}

const displayName = computed(
  () => props.transcription.sourceFileName ?? (props.transcription.type === 'REALTIME' ? 'Live recording' : 'Untitled'),
)

const formattedDate = computed(() => {
  return new Date(props.transcription.createdAt).toLocaleString()
})

async function onDownload(): Promise<void> {
  downloadError.value = null
  isDownloading.value = true
  try {
    const { downloadUrl } = await api.get<DownloadUrlResponse>(
      `/transcriptions/${props.transcription.transcriptionId}/download`,
    )
    if (!SAFE_DOWNLOAD_URL_PATTERN.test(downloadUrl)) {
      throw new Error('Received an unexpected download URL.')
    }
    window.location.href = downloadUrl
  } catch (err) {
    downloadError.value = toDisplayError(err, 'Download failed.').message
  } finally {
    isDownloading.value = false
  }
}
</script>

<template>
  <tr class="border-b border-gray-100 last:border-0" data-testid="transcription-row">
    <td class="px-4 py-3 text-sm text-gray-800">{{ displayName }}</td>
    <td class="px-4 py-3 text-sm text-gray-500">{{ transcription.type }}</td>
    <td class="px-4 py-3 text-sm text-gray-500">{{ formattedDate }}</td>
    <td class="px-4 py-3">
      <span class="badge" :class="STATUS_STYLES[transcription.status]" data-testid="status-badge">
        {{ transcription.status }}
      </span>
    </td>
    <td class="px-4 py-3 text-right">
      <button
        v-if="transcription.status === 'COMPLETED'"
        type="button"
        class="btn-secondary"
        data-testid="download-button"
        :disabled="isDownloading"
        @click="onDownload"
      >
        {{ isDownloading ? 'Preparing…' : 'Download' }}
      </button>
      <span v-if="downloadError" class="ml-2 text-xs text-red-600">{{ downloadError }}</span>
    </td>
  </tr>
</template>
