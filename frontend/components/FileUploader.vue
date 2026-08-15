<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { toDisplayError, type Transcription, type TranscriptionStatus, type UploadUrlResponse } from '~/types'

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB, per ARCHITECTURE.md §4.2
const AUDIO_MIME_PREFIX = 'audio/'
const POLL_INTERVAL_MS = 3000
const TERMINAL_STATUSES: ReadonlySet<TranscriptionStatus> = new Set(['COMPLETED', 'FAILED'])

type UploadState = 'idle' | 'requesting-url' | 'uploading' | 'processing' | 'completed' | 'failed'

const api = useApi()

const selectedFile = ref<File | null>(null)
const validationError = ref<string | null>(null)
const uploadState = ref<UploadState>('idle')
const uploadProgress = ref(0)
const errorMessage = ref<string | null>(null)
const transcription = ref<Transcription | null>(null)
const isDragging = ref(false)

let pollTimeoutHandle: ReturnType<typeof setTimeout> | null = null
let isDisposed = false

const canStartUpload = computed(
  () => selectedFile.value !== null && validationError.value === null && uploadState.value === 'idle',
)

/** Pure validation, kept isolated so it's easy to exercise in unit tests. */
function validateFile(file: File): string | null {
  if (!file.type.startsWith(AUDIO_MIME_PREFIX)) {
    return 'Only audio files are supported (e.g. mp3, wav, m4a).'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File is too large — the maximum size is 20MB.'
  }
  return null
}

function handleFile(file: File): void {
  validationError.value = validateFile(file)
  selectedFile.value = validationError.value ? null : file
  errorMessage.value = null
  transcription.value = null
  uploadState.value = 'idle'
}

function onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleFile(file)
}

function onDrop(event: DragEvent): void {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

/**
 * Uploads directly to the S3 presigned POST URL. XMLHttpRequest is used
 * instead of `fetch` purely because `fetch` has no cross-browser way to
 * report upload progress events; this request is otherwise unauthenticated
 * and goes straight to S3, never through `useApi`/`$fetch`.
 */
function uploadToS3(uploadUrl: string, fields: Record<string, string>, file: File): Promise<void> {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value))
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        uploadProgress.value = Math.round((event.loaded / event.total) * 100)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`S3 upload failed with status ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('S3 upload failed due to a network error.'))
    xhr.send(formData)
  })
}

/**
 * Polls once, then — only after that request has settled — schedules the
 * next attempt. A plain `setInterval(async fn, …)` would fire again on a
 * fixed clock even if the previous request hasn't resolved yet, letting
 * two in-flight requests race and apply their responses out of order; this
 * recursive `setTimeout` guarantees at most one poll in flight at a time.
 * `isDisposed` additionally guards against writing to component state
 * after unmount, in case a request resolves just as the user navigates
 * away.
 */
function schedulePoll(transcriptionId: string): void {
  pollTimeoutHandle = setTimeout(() => void pollOnce(transcriptionId), POLL_INTERVAL_MS)
}

async function pollOnce(transcriptionId: string): Promise<void> {
  try {
    const current = await api.get<Transcription>(`/transcriptions/${transcriptionId}`)
    if (isDisposed) return

    transcription.value = current
    if (!TERMINAL_STATUSES.has(current.status)) {
      schedulePoll(transcriptionId)
      return
    }

    uploadState.value = current.status === 'COMPLETED' ? 'completed' : 'failed'
    if (current.status === 'FAILED') {
      errorMessage.value = current.errorMessage ?? 'Transcription failed.'
    }
  } catch (err) {
    if (isDisposed) return
    uploadState.value = 'failed'
    errorMessage.value = toDisplayError(err, 'Could not check transcription status.').message
  }
}

function stopPolling(): void {
  if (pollTimeoutHandle !== null) {
    clearTimeout(pollTimeoutHandle)
    pollTimeoutHandle = null
  }
}

async function startUpload(): Promise<void> {
  const file = selectedFile.value
  if (!file) return

  errorMessage.value = null
  uploadProgress.value = 0

  try {
    uploadState.value = 'requesting-url'
    const { transcriptionId, uploadUrl, fields } = await api.post<UploadUrlResponse>(
      '/transcriptions/upload-url',
      { filename: file.name, contentType: file.type },
    )

    uploadState.value = 'uploading'
    await uploadToS3(uploadUrl, fields, file)

    uploadState.value = 'processing'
    schedulePoll(transcriptionId)
  } catch (err) {
    uploadState.value = 'failed'
    errorMessage.value = toDisplayError(err, 'Upload failed.').message
  }
}

onUnmounted(() => {
  isDisposed = true
  stopPolling()
})

defineExpose({ validateFile })
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300'"
      data-testid="dropzone"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <p class="mb-2 text-sm text-gray-600">Drag and drop an audio file here, or</p>
      <label class="btn-secondary cursor-pointer">
        Choose file
        <input
          type="file"
          accept="audio/*"
          class="hidden"
          data-testid="file-input"
          @change="onFileInputChange"
        />
      </label>
      <p class="mt-2 text-xs text-gray-400">Audio files only, up to 20MB.</p>
    </div>

    <p v-if="validationError" class="text-sm text-red-600" data-testid="validation-error">
      {{ validationError }}
    </p>

    <div v-if="selectedFile && !validationError" class="flex items-center justify-between rounded-md bg-gray-50 p-3">
      <span class="truncate text-sm text-gray-700" data-testid="selected-file-name">{{ selectedFile.name }}</span>
      <button type="button" class="btn-primary" :disabled="!canStartUpload" @click="startUpload">
        Upload &amp; transcribe
      </button>
    </div>

    <div v-if="uploadState === 'uploading'" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div class="h-full bg-brand-600" :style="{ width: `${uploadProgress}%` }" />
      </div>
      <p class="text-xs text-gray-500">Uploading… {{ uploadProgress }}%</p>
    </div>

    <p v-if="uploadState === 'requesting-url'" class="text-sm text-gray-500">Preparing upload…</p>
    <p v-if="uploadState === 'processing'" class="text-sm text-gray-500" data-testid="processing-status">
      Transcribing… this can take a little while.
    </p>

    <div v-if="uploadState === 'completed' && transcription" class="card" data-testid="upload-result">
      <p class="mb-1 font-medium text-green-700">Transcription completed</p>
      <p class="text-sm text-gray-600">Status: {{ transcription.status }}</p>
    </div>

    <p v-if="uploadState === 'failed' && errorMessage" class="text-sm text-red-600" data-testid="upload-error">
      {{ errorMessage }}
    </p>
  </div>
</template>
