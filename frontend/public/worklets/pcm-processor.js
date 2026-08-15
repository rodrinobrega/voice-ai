// AudioWorkletProcessor that converts the browser's native Float32 PCM
// audio into 16-bit signed little-endian PCM — the format Speechmatics'
// real-time API expects — and posts each frame back to the main thread.
// Runs on the dedicated audio rendering thread, which is why AudioWorklet
// is used here instead of the deprecated, main-thread ScriptProcessorNode.
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]
    if (!channel || channel.length === 0) {
      return true
    }

    const pcm16 = new Int16Array(channel.length)
    for (let i = 0; i < channel.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, channel[i]))
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }

    this.port.postMessage(pcm16, [pcm16.buffer])
    return true
  }
}

registerProcessor('pcm-processor', PcmProcessor)
