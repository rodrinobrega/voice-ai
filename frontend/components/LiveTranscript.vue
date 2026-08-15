<script setup lang="ts">
import type { RealtimeConnectionState } from '~/types'

interface Props {
  connectionState: RealtimeConnectionState
  finalSegments: string[]
  partialText: string
  micError?: string | null
  wsError?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  micError: null,
  wsError: null,
})

const STATE_LABELS: Record<Props['connectionState'], string> = {
  idle: 'Not recording',
  connecting: 'Connecting…',
  listening: 'Listening',
  stopping: 'Stopping…',
  stopped: 'Finished',
  error: 'Error',
}
</script>

<template>
  <div class="card space-y-3">
    <div class="flex items-center gap-2">
      <span
        class="h-2.5 w-2.5 rounded-full"
        :class="{
          'bg-red-500 animate-pulse': connectionState === 'listening',
          'bg-yellow-400': connectionState === 'connecting' || connectionState === 'stopping',
          'bg-gray-300': connectionState === 'idle' || connectionState === 'stopped',
          'bg-red-700': connectionState === 'error',
        }"
        data-testid="connection-indicator"
      />
      <span class="text-sm font-medium text-gray-700">{{ STATE_LABELS[connectionState] }}</span>
    </div>

    <p
      v-if="micError"
      class="rounded-md bg-red-50 p-3 text-sm text-red-700"
      data-testid="mic-error"
    >
      Microphone error: {{ micError }}
    </p>
    <p
      v-if="wsError"
      class="rounded-md bg-red-50 p-3 text-sm text-red-700"
      data-testid="ws-error"
    >
      Connection error: {{ wsError }}
    </p>

    <div
      class="min-h-[8rem] rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800"
      data-testid="transcript-pane"
    >
      <span v-for="(segment, index) in props.finalSegments" :key="index">{{ segment }} </span>
      <span class="text-gray-400">{{ partialText }}</span>
      <span
        v-if="connectionState === 'listening'"
        class="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-gray-400 align-middle"
      />
    </div>
  </div>
</template>
