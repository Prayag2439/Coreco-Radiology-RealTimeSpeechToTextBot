/**
 * AudioWorkletProcessor for Radiology STT.
 * Downsamples incoming Float32 microphone audio to 16,000 Hz Int16 PCM (Little Endian).
 * Slices processed samples into exact 320-byte buffers (160 samples = 10ms frames)
 * for WebRTC VAD alignment.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.frameSizeSamples = 160; // 10ms at 16kHz = 160 samples = 320 bytes
    this.sampleBuffer = new Int16Array(this.frameSizeSamples);
    this.sampleCount = 0;
    
    // Resampling state
    this.resampleRatio = 1.0;
    this.resampleOffset = 0.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const sourceSampleRate = sampleRate; // Global sample rate provided by Web Audio AudioWorklet
    const ratio = sourceSampleRate / this.targetSampleRate;

    // Linear interpolation downsampling
    let inputIndex = this.resampleOffset;
    while (inputIndex < inputChannel.length) {
      const i0 = Math.floor(inputIndex);
      const i1 = Math.min(i0 + 1, inputChannel.length - 1);
      const frac = inputIndex - i0;

      // Linear interpolation between consecutive samples
      const sample = (1 - frac) * inputChannel[i0] + frac * inputChannel[i1];

      // Clamp Float32 to [-1.0, 1.0] and scale to Int16
      const clamped = Math.max(-1.0, Math.min(1.0, sample));
      const int16Sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      this.sampleBuffer[this.sampleCount++] = Math.round(int16Sample);

      // When we accumulate 160 samples (320 bytes), dispatch to main thread
      if (this.sampleCount >= this.frameSizeSamples) {
        // Clone or transfer the 320-byte buffer
        const chunk = new Int16Array(this.sampleBuffer);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.sampleCount = 0;
      }

      inputIndex += ratio;
    }

    this.resampleOffset = inputIndex - inputChannel.length;
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
