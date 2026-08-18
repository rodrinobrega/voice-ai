<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useMicRecorder } from '~/composables/useMicRecorder'
import LiveTranscript from '~/components/LiveTranscript.vue'
import {
  DEFAULT_REALTIME_LANGUAGE,
  LANGUAGE_LABELS,
  REALTIME_LANGUAGES,
  toDisplayError,
  type AppError,
  type RealtimeConnectionState,
  type RealtimeLanguage,
  type RealtimeTokenResponse,
  type Transcription,
} from '~/types'

definePageMeta({ middleware: ['auth'] })

/**
 * Minimal slice of the Speechmatics real-time WebSocket protocol used
 * here. See ARCHITECTURE.md §4.3 and §7 for the integration overview —
 * these types describe wire messages, not our own API contract, so they
 * live locally rather than in `types/index.ts`.
 */
interface SpeechmaticsResult {
  alternatives?: Array<{ content: string }>
}
interface SpeechmaticsMessage {
  message: string
  reason?: string
  metadata?: { transcript?: string }
  results?: SpeechmaticsResult[]
}

const MAX_PARTIAL_DELAY_SECONDS = 2

const api = useApi()

// Speechmatics' real-time API has no `auto` option (Language Identification is
// batch-only), so a live session must be told which language to expect.
const language = ref<RealtimeLanguage>(DEFAULT_REALTIME_LANGUAGE)
const connectionState = ref<RealtimeConnectionState>('idle')
const partialText = ref('')
const finalSegments = ref<string[]>([])
const micErrorMessage = ref<string | null>(null)
const wsErrorMessage = ref<string | null>(null)
const isSaving = ref(false)
const savedTranscription = ref<Transcription | null>(null)

let socket: WebSocket | null = null
let seqNo = 0
let startedAt: number | null = null
// Set once and for all on unmount. Guards every socket/mic callback below
// from writing to component state after the page has navigated away (e.g.
// a message that was already in flight when the user clicked "Stop" and
// left the page).
let isDisposed = false

function sendAudioFrame(frame: Int16Array): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || connectionState.value !== 'listening') return
  socket.send(frame.buffer)
  seqNo += 1
}

const micRecorder = useMicRecorder({
  onAudioFrame: sendAudioFrame,
  onError: (error: AppError) => {
    if (isDisposed) return
    micErrorMessage.value = error.message
    connectionState.value = 'error'
  },
})

/**
 * `message` is parsed from a third-party WebSocket payload (Speechmatics),
 * so it's only cast, never guaranteed, to match `SpeechmaticsMessage` —
 * `results` in particular is guarded with `Array.isArray` rather than
 * assumed, since a malformed or unexpected server payload with `results`
 * present but not an array would otherwise throw on `.map(...)`.
 */
function extractTranscript(message: SpeechmaticsMessage): string {
  if (typeof message.metadata?.transcript === 'string') return message.metadata.transcript
  if (!Array.isArray(message.results)) return ''
  return message.results.map((r) => r.alternatives?.[0]?.content ?? '').join(' ').trim()
}

function handleSocketMessage(message: SpeechmaticsMessage): void {
  if (isDisposed) return

  switch (message.message) {
    case 'AddPartialTranscript':
      partialText.value = extractTranscript(message)
      break
    case 'AddTranscript': {
      const text = extractTranscript(message)
      if (text) finalSegments.value.push(text)
      partialText.value = ''
      break
    }
    case 'EndOfTranscript':
      connectionState.value = 'stopped'
      break
    case 'Error':
      // The server reported a protocol/session error — the connection is
      // no longer usable, so tear down the mic and socket rather than
      // leaving them running with nothing consuming their output.
      wsErrorMessage.value = message.reason ?? 'A real-time transcription error occurred.'
      connectionState.value = 'error'
      void micRecorder.stop()
      closeSocket()
      break
    default:
      break
  }
}

function parseMessage(data: unknown): SpeechmaticsMessage | null {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data) as SpeechmaticsMessage
  } catch {
    return null
  }
}

function buildStartRecognitionMessage(): Record<string, unknown> {
  return {
    message: 'StartRecognition',
    audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: micRecorder.sampleRate },
    transcription_config: {
      language: language.value,
      enable_partials: true,
      max_delay: MAX_PARTIAL_DELAY_SECONDS,
    },
  }
}

/**
 * Opens a new real-time session. Handlers close over the locally-created
 * `ws` instance (not the shared, mutable `socket` variable) and only ever
 * write to `socket`/component state if `socket` still points at this same
 * instance. Without that identity check, a *stale* handler from a
 * previous, already-superseded socket (e.g. its delayed `close` event)
 * could fire after a reconnect and null out — or error out — the new,
 * unrelated session.
 */
function openRealtimeSocket(url: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Speechmatics' documented pattern for browser clients using a
    // short-lived temporary key: pass it as the `jwt` query parameter.
    const wsUrl = `${url}?jwt=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    socket = ws

    ws.onopen = () => ws.send(JSON.stringify(buildStartRecognitionMessage()))
    ws.onerror = () => reject(new Error('Real-time connection failed.'))
    ws.onclose = (event) => onSocketClosed(ws, event)
    ws.onmessage = (event) => onSocketMessage(ws, event, resolve)
  })
}

function onSocketClosed(ws: WebSocket, event: CloseEvent): void {
  if (socket !== ws) return // a newer session has already replaced this one
  socket = null
  if (isDisposed) return

  if (connectionState.value === 'listening' || connectionState.value === 'connecting') {
    wsErrorMessage.value = `Connection closed unexpectedly (code ${event.code}).`
    connectionState.value = 'error'
    void micRecorder.stop()
  }
}

function onSocketMessage(ws: WebSocket, event: MessageEvent, resolveOpen: () => void): void {
  if (socket !== ws) return // stale message from a superseded session
  const message = parseMessage(event.data)
  if (!message) return
  if (message.message === 'RecognitionStarted') {
    resolveOpen()
    return
  }
  handleSocketMessage(message)
}

function resetState(): void {
  partialText.value = ''
  finalSegments.value = []
  micErrorMessage.value = null
  wsErrorMessage.value = null
  savedTranscription.value = null
  seqNo = 0
  startedAt = null
}

async function startRecording(): Promise<void> {
  // Idempotent restart: if an earlier session (e.g. one that ended in
  // `error`) left a mic stream or socket behind, tear it down first so we
  // never have two sessions racing each other.
  if (connectionState.value === 'connecting' || connectionState.value === 'listening') return
  await micRecorder.stop()
  closeSocket()

  resetState()
  connectionState.value = 'connecting'
  try {
    const { token, url } = await api.post<RealtimeTokenResponse>('/transcriptions/realtime-token')
    await openRealtimeSocket(url, token)
    startedAt = Date.now()
    await micRecorder.start()
    if (micErrorMessage.value) {
      // Mic access failed after the socket was already opened — tear the
      // session down rather than leaving an idle WebSocket connected.
      closeSocket()
      return
    }
    connectionState.value = 'listening'
  } catch (err) {
    closeSocket()
    connectionState.value = 'error'
    wsErrorMessage.value = toDisplayError(err, 'Could not start the real-time session.').message
  }
}

/**
 * Closes the current session's socket, if any. Sends `EndOfStream` first
 * when still `OPEN` so Speechmatics can finalize cleanly; a socket stuck
 * `CONNECTING` (e.g. we're retrying before the handshake finished) is
 * aborted directly. Always safe to call, including with no socket at all.
 */
function closeSocket(): void {
  if (!socket) return
  const ws = socket
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: seqNo }))
    ws.close()
  } else if (ws.readyState === WebSocket.CONNECTING) {
    ws.close()
  }
  socket = null
}

async function saveTranscript(): Promise<void> {
  const transcriptText = finalSegments.value.join(' ').trim()
  if (!transcriptText) {
    if (!isDisposed) connectionState.value = 'idle'
    return
  }

  isSaving.value = true
  try {
    const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined
    const saved = await api.post<Transcription>('/transcriptions/realtime', {
      transcriptText,
      durationSeconds,
      language: language.value,
    })
    if (isDisposed) return
    savedTranscription.value = saved
    connectionState.value = 'idle'
  } catch (err) {
    if (isDisposed) return
    wsErrorMessage.value = toDisplayError(err, 'Failed to save the transcript.').message
    connectionState.value = 'error'
  } finally {
    if (!isDisposed) isSaving.value = false
  }
}

async function stopRecording(): Promise<void> {
  connectionState.value = 'stopping'
  await micRecorder.stop()
  closeSocket()
  await saveTranscript()
}

onUnmounted(() => {
  isDisposed = true
  void micRecorder.stop()
  closeSocket()
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold text-gray-900">Record</h1>

    <div class="flex items-center gap-3">
      <label for="record-language" class="text-sm font-medium text-gray-700">Language</label>
      <select
        id="record-language"
        v-model="language"
        class="rounded-md border border-gray-300 px-3 py-2 text-sm"
        data-testid="record-language-select"
        :disabled="connectionState !== 'idle'"
      >
        <option v-for="code in REALTIME_LANGUAGES" :key="code" :value="code">
          {{ LANGUAGE_LABELS[code] }}
        </option>
      </select>
      <span class="text-xs text-gray-400">Live sessions can't auto-detect.</span>
    </div>

    <div class="flex gap-3">
      <button
        type="button"
        class="btn-primary"
        data-testid="start-recording"
        :disabled="connectionState === 'connecting' || connectionState === 'listening'"
        @click="startRecording"
      >
        Start recording
      </button>
      <button
        type="button"
        class="btn-secondary"
        data-testid="stop-recording"
        :disabled="connectionState !== 'listening'"
        @click="stopRecording"
      >
        Stop
      </button>
    </div>

    <LiveTranscript
      :connection-state="connectionState"
      :final-segments="finalSegments"
      :partial-text="partialText"
      :mic-error="micErrorMessage"
      :ws-error="wsErrorMessage"
    />

    <p v-if="isSaving" class="text-sm text-gray-500">Saving transcript…</p>
    <div v-if="savedTranscription" class="card" data-testid="record-saved">
      <p class="font-medium text-green-700">Saved to your history.</p>
    </div>
  </div>
</template>
