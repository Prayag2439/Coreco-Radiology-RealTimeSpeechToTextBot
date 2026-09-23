import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, Layers, RotateCcw, Sparkles, Activity, CheckCircle2 } from 'lucide-react';

/**
 * AnatomyViewer integrates the BioDigital Human SDK (HumanAPI) inside an iframe
 * and executes structured actions triggered by OpenAI tool calls (manipulate_3d_anatomy).
 */
export const AnatomyViewer = ({ onActionExecuted, registerActionHandler, onSwitchViewer }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('biodigital_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const humanRef = useRef(null);
  const pendingActionsRef = useRef([]);

  // 1. Asynchronously load BioDigital Human SDK
  useEffect(() => {
    const scriptId = 'biodigital-human-sdk';
    let script = document.getElementById(scriptId);

    const initHuman = () => {
      try {
        if (window.HumanAPI) {
          const human = new window.HumanAPI('anatomy-viewer');
          humanRef.current = human;

          human.on('human.ready', () => {
            setIsLoaded(true);
            // Execute any queued actions
            while (pendingActionsRef.current.length > 0) {
              const queued = pendingActionsRef.current.shift();
              handleViewerAction(queued);
            }
          });
        }
      } catch (err) {
        console.warn('BioDigital HumanAPI initialization notice:', err);
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://developer.biodigital.com/apis/v4/human-api.js';
      script.async = true;
      script.onload = initHuman;
      document.body.appendChild(script);
    } else if (window.HumanAPI) {
      initHuman();
    }

    return () => {
      humanRef.current = null;
    };
  }, []);

  // 2. Core action dispatcher for BioDigital HumanAPI
  const handleViewerAction = useCallback(({ action, objectIds = [], color = '#06b6d4' }) => {
    setActiveAction({ action, objectIds, color, timestamp: Date.now() });

    if (!humanRef.current || !isLoaded) {
      pendingActionsRef.current.push({ action, objectIds, color });
      return;
    }

    const human = humanRef.current;

    try {
      switch (action) {
        case 'isolate':
          human.send('scene.isolate', { objectIds });
          break;
        case 'highlight':
          human.send('scene.highlight', { objectIds, color });
          break;
        case 'xray':
          human.send('scene.xray', { objectIds });
          break;
        case 'dissect':
          human.send('scene.dissect', { objectIds });
          break;
        case 'reset':
          human.send('scene.reset');
          break;
        default:
          console.warn(`Unrecognized anatomy action: ${action}`);
          break;
      }

      if (onActionExecuted) {
        onActionExecuted({ action, objectIds, color });
      }
    } catch (err) {
      console.error('Error sending command to BioDigital HumanAPI:', err);
    }
  }, [isLoaded, onActionExecuted]);

  // Register external handler so parent components / WebSocket bridge can trigger it
  useEffect(() => {
    if (registerActionHandler) {
      registerActionHandler(handleViewerAction);
    }
  }, [registerActionHandler, handleViewerAction]);

  return (
    <div className="anatomy-viewer-container glass-panel-white">
      {/* Header & Tool Call Status HUD */}
      <div className="anatomy-viewer-header">
        <div className="anatomy-header-left">
          <div className="scan-indicator-badge">
            <span className="scan-dot" />
            <span>BIODIGITAL 3D ANATOMY</span>
          </div>
          <span className="slice-meta-tag">HUMAN SDK // HEAD & NECK</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {onSwitchViewer && (
            <button
              type="button"
              className="black-icon-btn small outline"
              onClick={onSwitchViewer}
              title="Switch to the built-in 3D Medical Scan which requires no API key"
            >
              <span>Use Built-In 3D Scan (No Key Needed)</span>
            </button>
          )}

          {/* Active Tool Call HUD Badge */}
          {activeAction && (
            <div className="tool-call-badge">
              <Sparkles size={13} style={{ color: '#0284c7' }} />
              <span>
                ACTION: <strong>{activeAction.action.toUpperCase()}</strong> ({activeAction.objectIds?.slice(0, 2).join(', ') || 'ALL'})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* BioDigital Authentication Helper Banner */}
      <div className="biodigital-auth-notice">
        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
          BioDigital Human requires a developer API key to embed on localhost.
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {showKeyInput ? (
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input
                type="text"
                placeholder="Paste BioDigital API Key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  localStorage.setItem('biodigital_api_key', e.target.value);
                }}
                className="slice-number-display"
                style={{ padding: '0.2rem 0.5rem', width: '180px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                className="black-icon-btn small"
                onClick={() => setShowKeyInput(false)}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="black-icon-btn small outline"
              onClick={() => setShowKeyInput(true)}
            >
              {apiKey ? 'Change API Key' : 'Enter API Key'}
            </button>
          )}
        </div>
      </div>

      {/* Embedded BioDigital Human Iframe or Auth Notice Card */}
      {!apiKey ? (
        <div className="biodigital-no-key-box">
          <Layers size={32} style={{ color: '#0284c7', margin: '0 auto' }} />
          <div className="biodigital-no-key-title">BioDigital Human Requires Developer License</div>
          <p className="biodigital-no-key-text">
            BioDigital servers require an authorized developer key to embed interactive 3D human anatomy on localhost.
          </p>
          <div className="biodigital-key-action-row">
            <input
              type="text"
              placeholder="Paste BioDigital API Key..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                localStorage.setItem('biodigital_api_key', e.target.value);
              }}
              className="key-input-field"
            />
          </div>
          {onSwitchViewer && (
            <button
              type="button"
              className="black-action-btn full-width"
              onClick={onSwitchViewer}
            >
              <span>Use Built-In 3D CT Scan (No Key Needed)</span>
            </button>
          )}
        </div>
      ) : (
        <div className="anatomy-iframe-wrapper">
          <iframe
            id="anatomy-viewer"
            src={`https://human.biodigital.com/viewer/?id=production/maleAdult/head_and_neck&ui-tools=true&key=${encodeURIComponent(apiKey)}`}
            width="100%"
            height="520px"
            frameBorder="0"
            allowFullScreen
            title="BioDigital 3D Human Anatomy Viewer"
            className="anatomy-iframe"
          />
        </div>
      )}

      {/* Quick Action Test Toolbar (Supports testing tool call payloads directly) */}
      <div className="anatomy-toolbar-deck">
        <span className="deck-label">SDK Actions:</span>
        <div className="anatomy-actions-row">
          <button
            type="button"
            className="black-icon-btn small outline"
            onClick={() =>
              handleViewerAction({
                action: 'highlight',
                objectIds: ['inferior_nasal_concha', 'middle_nasal_concha'],
                color: '#06b6d4',
              })
            }
            title="Highlight Turbinates & Concha"
          >
            <Sparkles size={12} />
            <span>Highlight Turbinates</span>
          </button>

          <button
            type="button"
            className="black-icon-btn small outline"
            onClick={() =>
              handleViewerAction({
                action: 'isolate',
                objectIds: ['maxillary_sinus', 'frontal_sinus', 'ethmoidal_air_cells'],
              })
            }
            title="Isolate Paranasal Sinuses"
          >
            <Eye size={12} />
            <span>Isolate Sinuses</span>
          </button>

          <button
            type="button"
            className="black-icon-btn small outline"
            onClick={() =>
              handleViewerAction({
                action: 'xray',
                objectIds: ['skull_bones', 'mandible'],
              })
            }
            title="X-Ray Facial Bones"
          >
            <Layers size={12} />
            <span>X-Ray Skeleton</span>
          </button>

          <button
            type="button"
            className="black-icon-btn small"
            onClick={() => handleViewerAction({ action: 'reset', objectIds: [] })}
            title="Reset Anatomy View"
          >
            <RotateCcw size={12} />
            <span>Reset Scene</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnatomyViewer;
