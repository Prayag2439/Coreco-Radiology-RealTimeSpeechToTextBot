import React from 'react';
import { Volume2, Radio, Filter, Mic } from 'lucide-react';

export const AudioVisualizer = ({
  isRecording,
  isSpeech,
  audioLevel = 0,
  freqData = [],
}) => {
  const barCount = 24;
  const bars = Array.from({ length: barCount }, (_, i) => {
    if (!isRecording) return 4;
    if (freqData && freqData.length > 0) {
      const step = Math.floor(freqData.length / barCount);
      const val = freqData[i * step] || 0;
      return Math.max(4, Math.min(26, Math.round((val / 255) * 26)));
    }
    return Math.max(4, Math.min(26, Math.round(audioLevel * 26 * (0.5 + Math.sin(i * 0.7) * 0.5))));
  });

  return (
    <div className="telemetry-strip-white">
      {/* VAD Gate Indicator */}
      <div className="telemetry-vad-group">
        <span className="telemetry-label">
          <Filter size={13} />
          Noise Filter:
        </span>
        {isRecording ? (
          isSpeech ? (
            <div className="vad-gate-indicator-white speech-active" id="vad-status-indicator">
              <span className="pulse-dot-green" />
              <span>SPEECH DETECTED (ACTIVE)</span>
            </div>
          ) : (
            <div className="vad-gate-indicator-white noise-filtered" id="vad-status-indicator">
              <Radio size={13} />
              <span>NOISE FILTERED (IDLE)</span>
            </div>
          )
        ) : (
          <div className="vad-gate-indicator-white idle" id="vad-status-indicator">
            <Mic size={12} />
            {/* <span>STANDBY (16kHz SAMPLING)</span> */}
            <span>STANDBY</span>
          </div>
        )}
      </div>

      {/* Real-time VU / Audio Equalizer */}
      <div className="telemetry-vu-group">
        <div className="telemetry-volume-text">
          <Volume2 size={14} />
          <span>{Math.round(audioLevel * 100)}%</span>
        </div>
        <div className="eq-bars">
          {bars.map((h, idx) => (
            <div
              key={idx}
              className="eq-bar-black"
              style={{
                height: `${h}px`,
                backgroundColor: isSpeech ? '#10b981' : isRecording ? '#0a0a0a' : '#cbd5e1',
                opacity: isRecording ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
