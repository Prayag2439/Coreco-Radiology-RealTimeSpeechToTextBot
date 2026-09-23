import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import corecoLogo from '../assets/coreco_logo.png';

export const Header = ({ isConnected, activeModel, latencyMs = 24 }) => {
  return (
    <header className="app-header-white glass-panel-white">
      <div className="brand-section">
        <img
          src={corecoLogo}
          alt="Coreco Technologies"
          style={{ height: '36px', objectFit: 'contain' }}
        />
        <div style={{ width: '1px', height: '28px', backgroundColor: '#e2e8f0', margin: '0 0.25rem' }} />
        <div>
          <h1 className="brand-title-black">RAD-STT // Medical Dictation</h1>
          <div className="brand-subtitle-gray">
            Radiology Real-Time Speech-to-Text Dictation Suite
          </div>
        </div>
      </div>

      <div className="header-badges-wrap">
        {/* WebSocket Connection Badge */}
        <div className={`badge-black ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? (
            <>
              <span className="pulse-dot-green" />
              <Wifi size={13} />
              {/* <span>LIVE WS (16kHz PCM)</span> */}
              <span>CONNECTED</span>
            </>
          ) : (
            <>
              <span className="pulse-dot-red" />
              <WifiOff size={13} />
            </>
          )}
        </div>
      </div>
    </header>
  );
};
