import React from 'react';
import { Mic, MicOff, Sparkles, Cpu } from 'lucide-react';

export const Controls = ({
  model,
  onModelChange,
  vadMode,
  onVadModeChange,
  isRecording,
  onToggleRecording,
  disabled = false,
  isConnected = true,
}) => {
  return (
    <div className="controls-bar glass-panel-white">
      {/* Model Selection Pills */}
      <div className="control-group">
        <span className="control-label">AI ENGINE</span>
        <div className="pill-selector-white">
          <button
            id="model-gemini-btn"
            type="button"
            className={`pill-btn-black ${model === 'gemini' ? 'active' : ''}`}
            onClick={() => onModelChange('gemini')}
            disabled={isRecording}
            title="Google Gemini 2.0 Multimodal Live API (Bidirectional WebSocket)"
          >
            <Sparkles size={14} />
            <span>Gemini Live</span>
          </button>
          <button
            id="model-openai-btn"
            type="button"
            className={`pill-btn-black ${model === 'openai' ? 'active' : ''}`}
            onClick={() => onModelChange('openai')}
            disabled={isRecording}
            title="OpenAI Realtime API (GPT-4o Realtime text output)"
          >
            <Cpu size={14} />
            <span>OpenAI Realtime</span>
          </button>
        </div>
      </div>

      {/* Main Dictate Trigger Button - Jet Black with high contrast */}
      <button
        id="dictate-toggle-btn"
        type="button"
        className={`mic-btn-black ${isRecording ? 'recording' : ''}`}
        onClick={onToggleRecording}
        title={isRecording ? 'Stop speech dictation (or press Space / F4)' : 'Start live radiology dictation (or press Space / F4)'}
      >
        {isRecording ? (
          <>
            <span className="rec-live-dot" />
            <MicOff size={18} />
            <span>STOP DICTATION</span>
          </>
        ) : (
          <>
            <Mic size={18} />
            <span>START DICTATION</span>
          </>
        )}
      </button>
    </div>
  );
};
