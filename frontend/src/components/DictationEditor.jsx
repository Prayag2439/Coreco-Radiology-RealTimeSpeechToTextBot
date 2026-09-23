import React, { useRef, useEffect, useState } from 'react';
import {
  Copy,
  Download,
  Trash2,
  Check,
  FileText,
  Sparkles,
  AlertCircle,
  Undo2,
} from 'lucide-react';

export const DictationEditor = ({
  transcript,
  onTranscriptChange,
  isRecording,
  activeModel,
  isStreaming,
}) => {
  const textareaRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [lastClearedText, setLastClearedText] = useState('');

  // Auto-scroll when new transcript deltas arrive while recording
  useEffect(() => {
    if (isRecording && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcript, isRecording]);

  // Robust copy with clipboard API + fallback for iframe / non-https environments
  const handleCopy = async () => {
    if (!transcript) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(transcript);
      } else {
        // Fallback
        const el = document.createElement('textarea');
        el.value = transcript;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDownload = () => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `radiology-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmClear = () => {
    setLastClearedText(transcript);
    onTranscriptChange('');
    setShowClearConfirm(false);
  };

  const handleUndoClear = () => {
    if (lastClearedText) {
      onTranscriptChange(lastClearedText);
      setLastClearedText('');
    }
  };

  // Word and character count calculation
  const trimmed = transcript.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const charCount = transcript.length;

  return (
    <div className="editor-panel glass-panel-white">
      {/* Editor Header */}
      <div className="editor-header-white">
        <div className="editor-title-group">
          <div className="editor-title-icon-black">
            <FileText size={16} />
          </div>
          <span className="editor-title-text">Radiology Dictation Transcript</span>
          {isStreaming && (
            <span className="typing-pill-black">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span>LIVE STREAMING ({activeModel.toUpperCase()})</span>
            </span>
          )}
        </div>

        {/* Action Buttons - Jet Black */}
        <div className="editor-actions">
          {lastClearedText && !transcript && (
            <button
              type="button"
              className="black-icon-btn outline"
              onClick={handleUndoClear}
              title="Undo last clear action"
            >
              <Undo2 size={13} />
              <span>Undo Clear</span>
            </button>
          )}

          <button
            id="copy-report-btn"
            type="button"
            className="black-icon-btn"
            onClick={handleCopy}
            disabled={!transcript}
            title={transcript ? 'Copy report to clipboard' : 'Editor is empty'}
          >
            {copied ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            id="download-report-btn"
            type="button"
            className="black-icon-btn"
            onClick={handleDownload}
            disabled={!transcript}
            title={transcript ? 'Export report as Markdown' : 'Editor is empty'}
          >
            <Download size={14} />
            <span>Export</span>
          </button>

          {showClearConfirm ? (
            <div className="clear-confirm-group">
              <span className="clear-confirm-text">Clear text?</span>
              <button
                type="button"
                className="black-action-btn small danger"
                onClick={handleConfirmClear}
              >
                Yes
              </button>
              <button
                type="button"
                className="black-icon-btn outline small"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              id="clear-report-btn"
              type="button"
              className="black-icon-btn danger-hover"
              onClick={() => {
                if (!transcript) return;
                setShowClearConfirm(true);
              }}
              disabled={!transcript}
              title={transcript ? 'Clear transcription buffer' : 'Editor is empty'}
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Textarea */}
      <textarea
        id="radiology-transcript-editor"
        ref={textareaRef}
        className="editor-textarea-white"
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
        placeholder="Click 'START DICTATION' or press Space to dictate. Your speech will be noise-filtered and transcribed in real time with automated medical punctuation conversion..."
        spellCheck="false"
      />

      {/* Editor Footer Metrics */}
      <div className="editor-footer-white">
        <div className="editor-status-indicator">
          STATUS:{' '}
          <span className={isRecording ? 'status-recording' : 'status-idle'}>
            {isRecording ? '● LIVE RECORDING' : '○ IDLE'}
          </span>
        </div>
        <div className="editor-metrics-group">
          <span>WORDS: {wordCount}</span>
          <span>CHARS: {charCount}</span>
          {/* <span>PAYLOAD: 16kHz Int16 PCM</span> */}
        </div>
      </div>
    </div>
  );
};
