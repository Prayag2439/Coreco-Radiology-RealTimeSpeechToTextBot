import React from 'react';
import {
  User,
  Calendar,
  Layers,
  FileCheck,
  Zap,
  Activity,
  Tag,
  Plus,
} from 'lucide-react';

const QUICK_FINDINGS = [
  { label: '+ Bilateral Turbinates Hypertrophy', text: 'Bilateral inferior turbinates hypertrophy noted.' },
  { label: '+ Left Concha Bullosa', text: 'Prominent left concha bullosa identified without fluid entrapment.' },
  { label: '+ Clear Paranasal Sinuses', text: 'Frontal, sphenoid, and ethmoid air cells are clear without mucosal thickening.' },
  { label: '+ Normal Ventricles', text: 'Ventricular system, sulci, and basal cisterns are symmetric and within normal limits.' },
  { label: '+ No Acute Hemorrhage', text: 'No acute intracranial hemorrhage or mass effect is identified.' },
  { label: '+ Clear Lungs', text: 'No focal consolidation, pneumothorax, or pleural effusion.' },
];

export const RadiologyStudyBanner = ({ onInsertMacro }) => {
  return (
    <div className="study-banner-card glass-panel-white">
      {/* Patient & Study Metadata Strip */}
      <div className="study-metadata-row">
        <div className="patient-main-badge">
          <div className="patient-avatar-black">
            <User size={18} />
          </div>
          <div>
            <div className="patient-name">DOE, JOHN (58Y / M)</div>
            <div className="patient-sub">MRN: #4092-RAD // DOB: 1968-04-12</div>
          </div>
        </div>

        <div className="study-data-metrics">
          <div className="study-metric-item">
            <span className="metric-label">MODALITY</span>
            <span className="metric-val">CT MAXILLOFACIAL / BRAIN</span>
          </div>

          <div className="study-metric-item">
            <span className="metric-label">ACCESSION</span>
            <span className="metric-val font-mono">ACC-2026-9812</span>
          </div>

          <div className="study-metric-item">
            <span className="metric-label">CONTRAST</span>
            <span className="metric-badge-contrast">IV GADOLINIUM (+)</span>
          </div>

          <div className="study-metric-item">
            <span className="metric-label">DOSE (DLP)</span>
            <span className="metric-val">312 mGy·cm</span>
          </div>

          <div className="study-metric-item">
            <span className="metric-label">SLICES</span>
            <span className="metric-val">128 (0.625mm)</span>
          </div>
        </div>
      </div>

      {/* Quick Findings Macro Insertion Strip */}
      <div className="macro-findings-strip">
        <div className="macro-label">
          <Tag size={13} />
          <span>Quick Findings:</span>
        </div>
        <div className="macro-tags-row">
          {QUICK_FINDINGS.map((macro, idx) => (
            <button
              key={idx}
              type="button"
              className="macro-tag-btn"
              onClick={() => onInsertMacro && onInsertMacro(macro.text)}
              title="Click to insert finding phrase into dictation report"
            >
              <Plus size={11} />
              <span>{macro.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
