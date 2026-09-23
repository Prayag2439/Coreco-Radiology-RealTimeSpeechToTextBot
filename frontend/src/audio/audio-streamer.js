/**
 * AudioStreamer handles microphone capture, client-side downsampling to 16kHz Int16 PCM,
 * slicing into 320-byte chunks, and bidirectional WebSocket communication with FastAPI.
 */

export class AudioStreamer {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.workletNode = null;
    this.scriptNode = null;
    this.analyser = null;
    this.isRecording = false;
    this.animFrameId = null;

    // Callbacks
    this.onVadStatus = null;
    this.onDelta = null;
    this.onTranscript = null;
    this.onToolCall = null;
    this.onStatus = null;
    this.onError = null;
    this.onAudioLevel = null;
  }

  /**
   * Establish WebSocket connection to backend.
   */
  async connect(wsUrl = `ws://${window.location.hostname}:8000/ws/dictate`) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          if (this.onStatus) this.onStatus({ state: 'connected', message: 'WebSocket connected' });
          resolve();
        };

        this.ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              this._handleJsonMessage(data);
            } catch (err) {
              console.error('Error parsing WS message:', err);
            }
          }
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          if (this.onError) this.onError('WebSocket connection error');
          reject(err);
        };

        this.ws.onclose = () => {
          if (this.onStatus) this.onStatus({ state: 'disconnected', message: 'WebSocket closed' });
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  _handleJsonMessage(data) {
    switch (data.type) {
      case 'vad':
        if (this.onVadStatus) this.onVadStatus(data);
        break;
      case 'delta':
        if (this.onDelta) this.onDelta(data.text, data.model);
        break;
      case 'transcript':
        if (this.onTranscript) this.onTranscript(data.text, data.is_final, data.model);
        break;
      case 'status':
        if (this.onStatus) this.onStatus(data);
        break;
      case 'tool_call':
        if (this.onToolCall) this.onToolCall(data.name, data.arguments);
        break;
      case 'error':
        if (this.onError) this.onError(data.message);
        break;
      case 'warning':
        if (this.onStatus) this.onStatus({ state: 'warning', message: data.message });
        break;
      default:
        break;
    }
  }

  /**
   * Start microphone capture and 16kHz Int16 PCM streaming.
   */
  async startRecording(options = {}) {
    if (this.isRecording) return;

    this.onVadStatus = options.onVadStatus || this.onVadStatus;
    this.onDelta = options.onDelta || this.onDelta;
    this.onStatus = options.onStatus || this.onStatus;
    this.onError = options.onError || this.onError;
    this.onAudioLevel = options.onAudioLevel || this.onAudioLevel;

    try {
      // 1. Acquire microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: false, // Keep noise suppression off so WebRTC VAD receives true background noise profile
          autoGainControl: true,
        },
      });

      // 2. Initialize Web Audio Context
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 3. Create Analyser for UI waveform and VU meter
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // 4. Try loading native AudioWorkletProcessor
      let workletLoaded = false;
      try {
        await this.audioContext.audioWorklet.addModule('/pcm-processor.js');
        this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        this.workletNode.port.onmessage = (event) => {
          this._sendAudioBuffer(event.data);
        };
        source.connect(this.workletNode);
        workletLoaded = true;
      } catch (err) {
        console.warn('AudioWorklet unavailable, falling back to ScriptProcessor:', err);
      }

      // 5. Fallback to ScriptProcessor if AudioWorklet fails
      if (!workletLoaded) {
        this._setupScriptProcessorFallback(source);
      }

      this.isRecording = true;
      this._startVisualizerLoop();

      if (this.onStatus) {
        this.onStatus({ state: 'recording', message: 'Dictation active (16kHz Int16 streaming)' });
      }
    } catch (err) {
      console.error('Error starting audio recording:', err);
      if (this.onError) this.onError(`Microphone access error: ${err.message}`);
      this.stopRecording();
      throw err;
    }
  }

  _setupScriptProcessorFallback(source) {
    const bufferSize = 2048;
    this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    const targetSampleRate = 16000;
    const frameSize = 160; // 320 bytes = 160 samples
    let sampleBuffer = new Int16Array(frameSize);
    let sampleCount = 0;
    let resampleOffset = 0.0;

    this.scriptNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      const ratio = this.audioContext.sampleRate / targetSampleRate;

      let idx = resampleOffset;
      while (idx < input.length) {
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, input.length - 1);
        const frac = idx - i0;
        const sample = (1 - frac) * input[i0] + frac * input[i1];
        const clamped = Math.max(-1.0, Math.min(1.0, sample));
        const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

        sampleBuffer[sampleCount++] = Math.round(int16);

        if (sampleCount >= frameSize) {
          const chunk = new Int16Array(sampleBuffer);
          this._sendAudioBuffer(chunk.buffer);
          sampleCount = 0;
        }

        idx += ratio;
      }
      resampleOffset = idx - input.length;
    };

    source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);
  }

  _sendAudioBuffer(arrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(arrayBuffer);
    }
  }

  _startVisualizerLoop() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const render = () => {
      if (!this.isRecording) return;
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalizedLevel = Math.min(1.0, average / 128.0);

      if (this.onAudioLevel) {
        this.onAudioLevel(normalizedLevel, dataArray);
      }

      this.animFrameId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Stop microphone capture.
   */
  stopRecording() {
    this.isRecording = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.onStatus) {
      this.onStatus({ state: 'idle', message: 'Dictation paused' });
    }
    if (this.onVadStatus) {
      this.onVadStatus({ is_speech: false, rms: 0 });
    }
  }

  /**
   * Send model and VAD configuration to backend.
   */
  sendConfig({ model, vad_mode }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'config',
          model,
          vad_mode,
        })
      );
    }
  }

  /**
   * Close connection.
   */
  disconnect() {
    this.stopRecording();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
