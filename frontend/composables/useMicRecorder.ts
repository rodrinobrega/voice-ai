import { ref, type Ref } from 'vue'
import { toDisplayError, type AppError } from '~/types'

/** Speechmatics real-time expects 16kHz 16-bit signed little-endian PCM. */
const TARGET_SAMPLE_RATE = 16000
const WORKLET_MODULE_URL = '/worklets/pcm-processor.js'
const WORKLET_NAME = 'pcm-processor'

export interface MicRecorderOptions {
  /** Called with each captured audio frame, already converted to Int16 PCM. */
  onAudioFrame: (frame: Int16Array) => void
  /** Called for permission-denied or any other capture failure. */
  onError: (error: AppError) => void
}

export interface MicRecorder {
  isRecording: Ref<boolean>
  sampleRate: number
  start: () => Promise<void>
  stop: () => Promise<void>
}

function toMicError(err: unknown): AppError {
  const name = err instanceof DOMException ? err.name : undefined
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { message: 'Microphone permission was denied.', code: name }
  }
  if (name === 'NotFoundError') {
    return { message: 'No microphone was found on this device.', code: name }
  }
  return { message: 'Could not access the microphone.', code: name ?? 'UnknownError' }
}

/**
 * Captures microphone audio as raw PCM frames using an `AudioWorkletNode`.
 * AudioWorklet is the modern replacement for the deprecated
 * `ScriptProcessorNode`: it runs the PCM conversion off the main thread
 * instead of firing synchronous `onaudioprocess` callbacks there.
 */
export function useMicRecorder(options: MicRecorderOptions): MicRecorder {
  const isRecording = ref(false)
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let workletNode: AudioWorkletNode | null = null

  async function requestMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      throw toMicError(err)
    }
  }

  async function start(): Promise<void> {
    try {
      mediaStream = await requestMicrophone()
      audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      await audioContext.audioWorklet.addModule(WORKLET_MODULE_URL)

      const source = audioContext.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME)
      workletNode.port.onmessage = (event: MessageEvent<Int16Array>): void => {
        options.onAudioFrame(event.data)
      }
      source.connect(workletNode)
      isRecording.value = true
    } catch (err) {
      await stop()
      const appError = err instanceof DOMException ? toMicError(err) : toDisplayError(err, 'Could not access the microphone.')
      options.onError(appError)
    }
  }

  async function stop(): Promise<void> {
    workletNode?.disconnect()
    workletNode = null
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null
    if (audioContext && audioContext.state !== 'closed') {
      try {
        await audioContext.close()
      } catch {
        // Best-effort cleanup: closing an AudioContext can reject if it's
        // already mid-teardown. `stop()` must never reject itself — callers
        // rely on that (some invoke it as `void micRecorder.stop()`), and a
        // rejection here would otherwise surface as an unhandled promise
        // rejection with nothing left to meaningfully recover from.
      }
    }
    audioContext = null
    isRecording.value = false
  }

  return { isRecording, sampleRate: TARGET_SAMPLE_RATE, start, stop }
}
