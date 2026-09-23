import React, { useState } from 'react';
import { HelpCircle, Mic, Check, Copy, PlusCircle } from 'lucide-react';

const PUNCTUATION_RULES = [
  { spoken: "'period'", symbol: '.' },
  { spoken: "'comma'", symbol: ',' },
  { spoken: "'colon'", symbol: ':' },
  { spoken: "'next line'", symbol: '↵ (Line)' },
  { spoken: "'new paragraph'", symbol: '↵↵ (Para)' },
  { spoken: "'open parenthesis'", symbol: '(' },
];

const TEST_SCRIPTS = [
  {
    title: 'Anatomy & Pathology Test (PDF Spec)',
    text: 'Patient presents with bilateral inferior turbinates hypertrophy period Significant mucosal thickening with left concha bullosa noted new paragraph Impression no acute intracranial hemorrhage period',
  },
  {
    title: 'Chest Radiograph Test',
    text: 'Lungs demonstrate mild bilateral basal atelectasis comma no focal consolidation or pneumothorax period Cardiomediastinal silhouette is normal period',
  },
];

export const PunctuationGuide = ({ onInsertSample }) => {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [insertedIndex, setInsertedIndex] = useState(null);

  const handleCopySample = async (text, idx) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleInsert = (text, idx) => {
    if (onInsertSample) {
      onInsertSample(text);
      setInsertedIndex(idx);
      setTimeout(() => setInsertedIndex(null), 1500);
    }
  };

  return (
    <div className="sidebar-card-white glass-panel-white">
      {/* Punctuation reference */}
      <div className="sidebar-title-row">
        <div className="sidebar-title-icon-black">
          <HelpCircle size={14} />
        </div>
        <span className="sidebar-title-text">Spoken Punctuation</span>
      </div>

      <div className="punct-grid-white">
        {PUNCTUATION_RULES.map((rule, i) => (
          <div key={i} className="punct-item-white">
            <span className="punct-spoken-text">{rule.spoken}</span>
            <span className="punct-result-badge">{rule.symbol}</span>
          </div>
        ))}
      </div>

      {/* Verification Test Scripts */}
      <div className="sidebar-title-row" style={{ marginTop: '0.75rem' }}>
        <div className="sidebar-title-icon-black">
          <Mic size={14} />
        </div>
        <span className="sidebar-title-text">Test Dictation Prompts</span>
      </div>

      <div className="test-phrases-col">
        {TEST_SCRIPTS.map((script, idx) => (
          <div key={idx} className="test-phrase-card-white">
            <div className="test-phrase-title-row">
              <span className="test-phrase-title">{script.title}</span>
            </div>
            <div className="test-phrase-body">"{script.text}"</div>
            <div className="test-phrase-actions">
              <button
                type="button"
                className="black-icon-btn small"
                onClick={() => handleInsert(script.text, idx)}
                title="Insert prompt directly into the editor"
              >
                {insertedIndex === idx ? (
                  <>
                    <Check size={11} style={{ color: '#34d399' }} />
                    <span>Inserted</span>
                  </>
                ) : (
                  <>
                    <PlusCircle size={11} />
                    <span>Insert in Report</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="black-icon-btn outline small"
                onClick={() => handleCopySample(script.text, idx)}
                title="Copy prompt to speak into microphone"
              >
                {copiedIndex === idx ? (
                  <>
                    <Check size={11} style={{ color: '#34d399' }} />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
