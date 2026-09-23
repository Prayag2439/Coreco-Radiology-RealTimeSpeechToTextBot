import React, { useState } from 'react';
import { Layers, ChevronRight, FilePlus2, Check } from 'lucide-react';

const TEMPLATES = [
  {
    name: 'CT Sinuses / Turbinates',
    description: 'Includes Concha bullosa & inferior turbinates terminology',
    modality: 'CT Maxillofacial',
    text: `EXAMINATION: CT Sinuses / Maxillofacial without IV contrast.
CLINICAL INDICATION: Chronic sinusitis, nasal obstruction.

FINDINGS:
Nasal Cavity: Bilateral inferior turbinates hypertrophy noted. A prominent left concha bullosa is identified without fluid entrapment.
Sinuses: Mild mucosal thickening along the dependent floors of the bilateral maxillary sinuses. Frontal, sphenoid, and ethmoid air cells are clear.
Osteomeatal Complexes: Patent bilaterally. No bony erosion or destruction.

IMPRESSION:
1. Bilateral inferior turbinates hypertrophy and left concha bullosa.
2. Mild chronic bilateral maxillary sinus mucosal thickening.`,
  },
  {
    name: 'Chest Radiograph (2-View)',
    description: 'Standard PA and Lateral chest evaluation',
    modality: 'X-Ray Chest',
    text: `EXAMINATION: Chest Radiograph, PA and Lateral.
CLINICAL INDICATION: Cough, shortness of breath.
COMPARISON: None.

FINDINGS:
Lungs: Clear bilaterally. No focal consolidation, pneumothorax, or pleural effusion.
Cardiomediastinal: Heart size and mediastinal contours are within normal limits.
Bones: Thoracic cage structures demonstrate no acute osseous abnormality.

IMPRESSION:
No acute cardiopulmonary disease.`,
  },
  {
    name: 'MRI Brain (W/WO Contrast)',
    description: 'Intracranial parenchyma & ventricular protocol',
    modality: 'MRI Brain',
    text: `EXAMINATION: MRI Brain without and with IV contrast.
CLINICAL INDICATION: Persistent headache, evaluate for space-occupying lesion.

FINDINGS:
No focal parenchymal signal abnormality on T1, T2, or FLAIR sequences.
No restricted diffusion to suggest acute ischemia.
Ventricular system, sulci, and basal cisterns are age-appropriate.
No pathological enhancement following intravenous gadolinium administration.

IMPRESSION:
Normal MRI examination of the brain.`,
  },
];

export const ReportTemplates = ({ onInsertTemplate }) => {
  const [insertedIdx, setInsertedIdx] = useState(null);

  const handleInsert = (tmplText, idx) => {
    onInsertTemplate(tmplText);
    setInsertedIdx(idx);
    setTimeout(() => setInsertedIdx(null), 1800);
  };

  return (
    <div className="sidebar-card-white glass-panel-white">
      <div className="sidebar-title-row">
        <div className="sidebar-title-icon-black">
          <Layers size={14} />
        </div>
        <span className="sidebar-title-text">Clinical Templates</span>
      </div>

      <div className="templates-list-col">
        {TEMPLATES.map((tmpl, idx) => (
          <div key={tmpl.name} className="template-card-white">
            <div className="template-info">
              <div className="template-name-row">
                <span className="template-name">{tmpl.name}</span>
                <span className="template-modality-badge">{tmpl.modality}</span>
              </div>
              <div className="template-desc">{tmpl.description}</div>
            </div>
            <button
              type="button"
              className="black-action-btn small"
              onClick={() => handleInsert(tmpl.text, idx)}
              title="Insert template into report editor"
            >
              {insertedIdx === idx ? (
                <>
                  <Check size={12} style={{ color: '#34d399' }} />
                  <span>Inserted</span>
                </>
              ) : (
                <>
                  <FilePlus2 size={12} />
                  <span>Insert</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
