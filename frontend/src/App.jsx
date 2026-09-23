import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Controls } from './components/Controls';
import { AudioVisualizer } from './components/AudioVisualizer';
import { DictationEditor } from './components/DictationEditor';
import { AudioStreamer } from './audio/audio-streamer';

export function App() {
  const [model, setModel] = useState('gemini');
  const [vadMode, setVadMode] = useState(2);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeech, setIsSpeech] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [freqData, setFreqData] = useState(new Uint8Array(32));
  const [transcript, setTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('Connecting to Radiology STT Backend...');

  const streamerRef = useRef(null);
  const streamingTimerRef = useRef(null);
  const baseTranscriptRef = useRef('');
  const offlineSimIntervalRef = useRef(null);

  // Initialize AudioStreamer once
  useEffect(() => {
    const streamer = new AudioStreamer();
    streamerRef.current = streamer;

    const connectWebSocket = async () => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.hostname}:5001/ws/dictate`;

        await streamer.connect(wsUrl);
        setIsConnected(true);
        setStatusText('Connected to Radiology STT Backend');

        // Initial config dispatch
        streamer.sendConfig({ model, vad_mode: vadMode });
      } catch (err) {
        setIsConnected(false);
        setStatusText('Backend offline. Simulation mode active.');
        setTimeout(connectWebSocket, 4000);
      }
    };

    connectWebSocket();

    // Streamer callbacks
    streamer.onStatus = (status) => {
      if (status.state === 'connected') {
        setIsConnected(true);
        setStatusText(status.message || 'Connected to backend');
      } else if (status.state === 'disconnected') {
        setIsConnected(false);
        setStatusText('Disconnected from server. Reconnecting...');
        setTimeout(connectWebSocket, 2000);
      } else if (status.message) {
        setStatusText(status.message);
      }
    };

    streamer.onVadStatus = (vadData) => {
      setIsSpeech(Boolean(vadData.is_speech));
    };

    streamer.onAudioLevel = (level, rawFreqs) => {
      setAudioLevel(level);
      setFreqData(rawFreqs);
    };

    streamer.onTranscript = (liveText, isFinal, activeModel) => {
      setIsStreaming(true);
      const base = baseTranscriptRef.current ? baseTranscriptRef.current.trimEnd() + ' ' : '';
      const updated = base + liveText;
      setTranscript(updated);
      if (isFinal) {
        baseTranscriptRef.current = updated;
      }

      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
      }
      streamingTimerRef.current = setTimeout(() => {
        setIsStreaming(false);
      }, 700);
    };

    streamer.onDelta = (textDelta, activeModel) => {
      // Used by streaming token providers (e.g. OpenAI Realtime)
      if (activeModel === 'openai') {
        setIsStreaming(true);
        setTranscript((prev) => {
          const updated = prev + textDelta;
          baseTranscriptRef.current = updated;
          return updated;
        });

        if (streamingTimerRef.current) {
          clearTimeout(streamingTimerRef.current);
        }
        streamingTimerRef.current = setTimeout(() => {
          setIsStreaming(false);
        }, 700);
      }
    };

    streamer.onError = (errMsg) => {
      setStatusText(`Notice: ${errMsg}`);
    };

    return () => {
      streamer.disconnect();
    };
  }, []);

  // Keyboard shortcut listener (F4 or Spacebar when not editing text)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === 'textarea' || activeTag === 'input';

      if (e.key === 'F4') {
        e.preventDefault();
        toggleRecording();
      } else if (e.code === 'Space' && !isInputFocused) {
        e.preventDefault();
        toggleRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isConnected, model]);

  // Model change handler
  const handleModelChange = (newModel) => {
    setModel(newModel);
    if (streamerRef.current && isConnected) {
      streamerRef.current.sendConfig({ model: newModel, vad_mode: vadMode });
    }
  };

  // VAD mode change handler
  const handleVadModeChange = (newMode) => {
    setVadMode(newMode);
    if (streamerRef.current && isConnected) {
      streamerRef.current.sendConfig({ model, vad_mode: newMode });
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (streamerRef.current) {
        streamerRef.current.stopRecording();
      }
      setIsRecording(false);
      setIsSpeech(false);
      setAudioLevel(0);
      baseTranscriptRef.current = transcript;
    } else {
      // Start recording
      baseTranscriptRef.current = transcript;

      if (!isConnected) {
        connectWebSocket();
      }

      if (streamerRef.current) {
        try {
          await streamerRef.current.startRecording();
          setIsRecording(true);
        } catch (err) {
          console.warn('Direct mic streaming error:', err);
        }
      }
    }
  };

  const handleInsertText = (textToInsert) => {
    setTranscript((prev) => {
      const updated = !prev.trim() ? textToInsert : prev.trimEnd() + '\n\n' + textToInsert;
      baseTranscriptRef.current = updated;
      return updated;
    });
  };

  return (
    <div className="app-container-white">
      {/* Top Clinical Header */}
      <Header isConnected={isConnected} activeModel={model} />

      {/* Main Controls: Engine selector, VAD chips, Jet-Black Dictate button */}
      <Controls
        model={model}
        onModelChange={handleModelChange}
        vadMode={vadMode}
        onVadModeChange={handleVadModeChange}
        isRecording={isRecording}
        onToggleRecording={toggleRecording}
        disabled={false}
        isConnected={isConnected}
      />

      {/* Main Dictation Workstation */}
      <div className="workstation-grid">
        {/* Live Audio Telemetry & Dictation Transcript Editor */}
        <div className="editor-column">
          <AudioVisualizer
            isRecording={isRecording}
            isSpeech={isSpeech}
            audioLevel={audioLevel}
            freqData={freqData}
          />

          <DictationEditor
            transcript={transcript}
            onTranscriptChange={(val) => {
              setTranscript(val);
              baseTranscriptRef.current = val;
            }}
            isRecording={isRecording}
            activeModel={model}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
