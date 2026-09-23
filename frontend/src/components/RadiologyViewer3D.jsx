import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  Layers,
  RotateCw,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Sliders,
  Eye,
  PlusCircle,
  Activity,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

// Clinical color palette — matches pathology reference viewer design
const CLINICAL_COLORS = {
  normal:    0x3ecfe0, // Cyan  — healthy / baseline
  pathology: 0xf59e0b, // Amber — turbinate hypertrophy / mucosal thickening
  variant:   0xa78bfa, // Violet — anatomic variants (concha bullosa)
  negative:  0x34d399, // Green  — reassuring negative ("no hemorrhage")
  alert:     0xef4444, // Red    — acute positive findings
};

// Map each named structure mesh to its clinical metadata so hover tooltip can read it
const STRUCTURE_META = {
  left_inf_turbinate:  { name: 'Left Inferior Turbinate',  category: 'Nasal Airway',    finding: 'Left inferior turbinate — evaluate for hypertrophy and luminal narrowing.', defaultColor: CLINICAL_COLORS.normal },
  right_inf_turbinate: { name: 'Right Inferior Turbinate', category: 'Nasal Airway',    finding: 'Right inferior turbinate — evaluate for hypertrophy and luminal narrowing.', defaultColor: CLINICAL_COLORS.normal },
  left_mid_turbinate:  { name: 'Left Middle Turbinate',    category: 'Ostiomeatal Complex', finding: 'Left middle turbinate — evaluate for concha bullosa and contact points.', defaultColor: CLINICAL_COLORS.normal },
  right_mid_turbinate: { name: 'Right Middle Turbinate',   category: 'Ostiomeatal Complex', finding: 'Right middle turbinate — evaluate for concha bullosa and contact points.', defaultColor: CLINICAL_COLORS.normal },
  left_sup_turbinate:  { name: 'Left Superior Turbinate',  category: 'Olfactory Cleft',  finding: 'Left superior turbinate — olfactory cleft patency.', defaultColor: CLINICAL_COLORS.normal },
  right_sup_turbinate: { name: 'Right Superior Turbinate', category: 'Olfactory Cleft',  finding: 'Right superior turbinate — olfactory cleft patency.', defaultColor: CLINICAL_COLORS.normal },
  left_concha_bullosa: { name: 'Left Concha Bullosa',      category: 'Anatomic Variant', finding: 'Prominent left concha bullosa — aeration of the middle turbinate without fluid entrapment.', defaultColor: CLINICAL_COLORS.variant },
  right_concha_bullosa:{ name: 'Right Concha Bullosa',     category: 'Anatomic Variant', finding: 'Right concha bullosa — aeration of the middle turbinate.', defaultColor: CLINICAL_COLORS.variant },
  nasal_septum:        { name: 'Nasal Septum',             category: 'Midline Structure', finding: 'Nasal septum — midline reference. Evaluate for deviation.', defaultColor: CLINICAL_COLORS.normal },
  nasal_mucosa_left:   { name: 'Left Nasal Mucosa',        category: 'Mucosal Surface',  finding: 'Left inferior meatal mucosal lining — evaluate for thickening.', defaultColor: CLINICAL_COLORS.normal },
  nasal_mucosa_right:  { name: 'Right Nasal Mucosa',       category: 'Mucosal Surface',  finding: 'Right inferior meatal mucosal lining — evaluate for thickening.', defaultColor: CLINICAL_COLORS.normal },
};

// Anatomical landmarks specialized per scan / tissue type
const ANATOMICAL_LANDMARKS = {
  Bone: [
    {
      id: 'concha',
      name: 'Left Concha Bullosa',
      position: [-0.12, 0.10, 0.86],
      finding: 'Prominent left concha bullosa identified without fluid entrapment or mucosal compromise.',
      category: 'Sinus/Nasal',
    },
    {
      id: 'turbinates',
      name: 'Inferior Turbinates',
      position: [0.0, -0.10, 0.92],
      finding: 'Bilateral inferior turbinates hypertrophy with moderate luminal narrowing.',
      category: 'Airway',
    },
    {
      id: 'maxillary',
      name: 'Maxillary Sinuses',
      position: [0.42, -0.15, 0.75],
      finding: 'Mild chronic mucosal thickening along the dependent floor of the maxillary sinuses.',
      category: 'Sinus',
    },
    {
      id: 'frontal',
      name: 'Frontal Sinuses',
      position: [0.0, 0.55, 0.85],
      finding: 'Frontal air cells are clear bilaterally with patent frontonasal ducts.',
      category: 'Sinus',
    },
    {
      id: 'zygoma',
      name: 'Zygomatic Arch',
      position: [-0.68, 0.0, 0.50],
      finding: 'No osseous fracture or diastasis of the zygomaticomaxillary complex.',
      category: 'Osseous Skeleton',
    },
  ],
  Brain: [
    {
      id: 'frontal_lobe',
      name: 'Frontal Cortex',
      position: [0.0, 0.45, 0.85],
      finding: 'No focal parenchymal signal abnormality or edema within the frontal lobes.',
      category: 'Cerebrum',
    },
    {
      id: 'ventricles',
      name: 'Lateral Ventricles',
      position: [0.0, 0.15, 0.0],
      finding: 'Ventricular system and basal cisterns are symmetric and within age-appropriate normal limits.',
      category: 'Intracranial',
    },
    {
      id: 'temporal_lobe',
      name: 'Temporal Lobe',
      position: [0.85, 0.0, 0.2],
      finding: 'Hippocampal volume and temporal lobes demonstrate normal parenchymal architecture.',
      category: 'Cerebrum',
    },
    {
      id: 'cerebellum',
      name: 'Cerebellum',
      position: [0.0, -0.55, -0.55],
      finding: 'Cerebellar hemispheres and vermis are intact without tonsillar herniation.',
      category: 'Posterior Fossa',
    },
    {
      id: 'brainstem',
      name: 'Brainstem & Pons',
      position: [0.0, -0.75, 0.0],
      finding: 'Brainstem shows normal caliber with patent pre-pontine and basal cisterns.',
      category: 'Neurovascular',
    },
  ],
  'Soft Tissue': [
    {
      id: 'masseter',
      name: 'Masseter Muscle',
      position: [-0.65, -0.15, 0.45],
      finding: 'Bilateral masticator spaces and masseter muscles are symmetric without mass lesion.',
      category: 'Musculature',
    },
    {
      id: 'carotid',
      name: 'Carotid Bifurcation',
      position: [0.45, -0.25, 0.1],
      finding: 'Carotid arterial bifurcation is patent bilaterally without significant calcified atheroma.',
      category: 'Vasculature',
    },
    {
      id: 'thyroid',
      name: 'Thyroid Cartilage',
      position: [0.0, 0.15, 0.25],
      finding: 'Thyroid cartilage contours are symmetric with patent hypopharynx.',
      category: 'Airway / Larynx',
    },
  ],
  'Lung / Air': [
    {
      id: 'right_upper',
      name: 'Right Upper Lobe',
      position: [0.45, 0.20, 0.15],
      finding: 'Right upper lobe parenchyma is clear without nodule or consolidation.',
      category: 'Pulmonary',
    },
    {
      id: 'left_basal',
      name: 'Left Basal Segment',
      position: [-0.45, -0.55, 0.10],
      finding: 'Mild dependent left basal subsegmental atelectasis without pleural effusion.',
      category: 'Pulmonary',
    },
    {
      id: 'bronchus',
      name: 'Tracheobronchial Tree',
      position: [0.0, 0.35, 0.05],
      finding: 'Main carina and bilateral primary bronchi are widely patent without endobronchial lesion.',
      category: 'Airway',
    },
    {
      id: 'cardiac',
      name: 'Cardiac Silhouette',
      position: [-0.15, -0.15, 0.25],
      finding: 'Cardiomediastinal contour is normal in size without pericardial effusion.',
      category: 'Cardiovascular',
    },
  ],
  'BP3D Sinus': [
    {
      id: 'bp3d_inf_concha',
      name: 'Inferior Turbinates (BP3D)',
      position: [0.12, -0.05, 0.45],
      finding: 'Bilateral inferior nasal conchae (BodyParts3D polygon mesh) — evaluate for turbinate mucosal hypertrophy and airway patency.',
      category: 'Sinonasal / Airway',
    },
    {
      id: 'bp3d_septum',
      name: 'Nasal Septum & Vomer (BP3D)',
      position: [0.0, 0.05, 0.35],
      finding: 'Cartilaginous septum and vomer (BodyParts3D polygon mesh) — intact midline structure without osseous deflection.',
      category: 'Midline Septal Skeleton',
    },
    {
      id: 'bp3d_ethmoid',
      name: 'Ethmoid Bone (BP3D)',
      position: [0.0, 0.35, 0.15],
      finding: 'Ethmoid air cells and cribriform plate (BodyParts3D polygon mesh) — clear without opacification or dehiscence.',
      category: 'Anterior Cranial Base',
    },
    {
      id: 'bp3d_sphenoid',
      name: 'Sphenoid Bone (BP3D)',
      position: [0.0, 0.15, -0.45],
      finding: 'Sphenoid bone and sella turcica (BodyParts3D polygon mesh) — intact cortical boundaries without bone erosion.',
      category: 'Central Skull Base',
    },
  ],
};

// Hounsfield Unit Window/Level Presets with distinct Anatomical Scan Modes
const HU_PRESETS = [
  { name: 'Bone', label: 'Bone (Skeleton)', wl: 'W:2000 L:500', model: 'Bone' },
  { name: 'BP3D Sinus', label: 'BP3D (Sinus & Base)', wl: 'W:2400 L:600', model: 'BP3D Sinus' },
  { name: 'Brain', label: 'Brain (Neuro)', wl: 'W:80 L:40', model: 'Brain' },
  { name: 'Soft Tissue', label: 'Soft Tissue (Neck)', wl: 'W:350 L:50', model: 'Soft Tissue' },
  { name: 'Lung / Air', label: 'Lung (Thorax)', wl: 'W:1500 L:-600', model: 'Lung / Air' },
];

// Exact Anatomical Location Mapping for Text in the Description / Transcript Field
const PINPOINT_RULES = [
  {
    terms: ['concha bullosa', 'concha', 'left concha', 'nasal concha'],
    preset: 'Bone',
    id: 'concha',
    name: 'Left Concha Bullosa',
    category: 'Sinus/Nasal Cavity',
    position: [-0.12, 0.10, 0.86],
    snippet: 'Prominent left concha bullosa identified without fluid entrapment.',
  },
  {
    terms: ['turbinate', 'turbinates', 'hypertrophy', 'inferior turbinate', 'nasal obstruction'],
    preset: 'Bone',
    id: 'turbinates',
    name: 'Inferior Turbinates',
    category: 'Nasal Airway',
    position: [0.0, -0.10, 0.92],
    snippet: 'Bilateral inferior turbinates hypertrophy noted with moderate luminal narrowing.',
  },
  {
    terms: ['maxillary', 'maxillary sinus', 'maxillary sinuses', 'mucosal thickening', 'sinusitis'],
    preset: 'Bone',
    id: 'maxillary',
    name: 'Maxillary Sinuses',
    category: 'Paranasal Sinus Floor',
    position: [0.42, -0.15, 0.75],
    snippet: 'Mild chronic mucosal thickening along dependent floors of maxillary sinuses.',
  },
  {
    terms: ['frontal sinus', 'frontal air', 'frontonasal'],
    preset: 'Bone',
    id: 'frontal',
    name: 'Frontal Sinuses',
    category: 'Anterior Cranial Air Cells',
    position: [0.0, 0.55, 0.85],
    snippet: 'Frontal air cells are clear bilaterally with patent ducts.',
  },
  {
    terms: ['zygoma', 'zygomatic', 'mandible', 'jawbone', 'facial skeleton', 'osseous'],
    preset: 'Bone',
    id: 'zygoma',
    name: 'Zygomatic Arch & Facial Skeleton',
    category: 'Osseous Skeleton',
    position: [-0.68, 0.0, 0.50],
    snippet: 'No osseous fracture or diastasis of zygomaticomaxillary complex.',
  },
  {
    terms: ['ventricle', 'ventricles', 'ventricular', 'basal cistern', 'hydrocephalus', 'hemorrhage'],
    preset: 'Brain',
    id: 'ventricles',
    name: 'Lateral Ventricles & Basal Cisterns',
    category: 'Intracranial Ventricular System',
    position: [0.0, 0.15, 0.0],
    snippet: 'Ventricular system and basal cisterns are symmetric and within normal limits.',
  },
  {
    terms: ['frontal lobe', 'frontal cortex', 'parenchyma', 'cerebral', 'cefalea', 'headache'],
    preset: 'Brain',
    id: 'frontal_lobe',
    name: 'Frontal Cortex & Parenchyma',
    category: 'Cerebrum (Anterior Fossa)',
    position: [0.0, 0.45, 0.85],
    snippet: 'No focal parenchymal signal abnormality or edema within frontal lobes.',
  },
  {
    terms: ['temporal lobe', 'temporal', 'hippocampus'],
    preset: 'Brain',
    id: 'temporal_lobe',
    name: 'Temporal Lobe & Hippocampus',
    category: 'Cerebrum (Middle Fossa)',
    position: [0.85, 0.0, 0.2],
    snippet: 'Hippocampal volume and temporal lobes demonstrate normal parenchymal architecture.',
  },
  {
    terms: ['cerebellum', 'cerebellar', 'posterior fossa', 'vermis', 'tonsillar'],
    preset: 'Brain',
    id: 'cerebellum',
    name: 'Cerebellar Hemispheres & Vermis',
    category: 'Posterior Fossa',
    position: [0.0, -0.55, -0.55],
    snippet: 'Cerebellar hemispheres and vermis are intact without tonsillar herniation.',
  },
  {
    terms: ['brainstem', 'pons', 'medulla'],
    preset: 'Brain',
    id: 'brainstem',
    name: 'Brainstem & Pre-pontine Cistern',
    category: 'Neurovascular Axis',
    position: [0.0, -0.75, 0.0],
    snippet: 'Brainstem shows normal caliber with patent pre-pontine cisterns.',
  },
  {
    terms: ['carotid', 'carotid artery', 'bifurcation', 'stenosis', 'atheroma'],
    preset: 'Soft Tissue',
    id: 'carotid',
    name: 'Carotid Artery Bifurcation',
    category: 'Cervical Vasculature',
    position: [0.45, -0.25, 0.1],
    snippet: 'Carotid arterial bifurcation is patent bilaterally without stenosis.',
  },
  {
    terms: ['masseter', 'masticator', 'chewing muscle'],
    preset: 'Soft Tissue',
    id: 'masseter',
    name: 'Masseter Muscle',
    category: 'Masticator Space Musculature',
    position: [-0.65, -0.15, 0.45],
    snippet: 'Bilateral masseter muscles are symmetric without lesion.',
  },
  {
    terms: ['thyroid', 'larynx', 'hypopharynx', 'vocal cord'],
    preset: 'Soft Tissue',
    id: 'thyroid',
    name: 'Thyroid Cartilage & Laryngeal Airway',
    category: 'Laryngeal Complex',
    position: [0.0, 0.15, 0.25],
    snippet: 'Thyroid cartilage contours are symmetric with patent hypopharynx.',
  },
  {
    terms: ['atelectasis', 'consolidation', 'pneumothorax', 'lung', 'lungs', 'pleural effusion', 'cough', 'dyspnea'],
    preset: 'Lung / Air',
    id: 'left_basal',
    name: 'Left Basal Pulmonary Segment',
    category: 'Thoracic Lung Fields',
    position: [-0.45, -0.55, 0.10],
    snippet: 'Mild dependent left basal subsegmental atelectasis without pleural effusion.',
  },
  {
    terms: ['bronchus', 'bronchial', 'trachea', 'carina'],
    preset: 'Lung / Air',
    id: 'bronchus',
    name: 'Tracheobronchial Tree & Main Carina',
    category: 'Central Pulmonary Airway',
    position: [0.0, 0.35, 0.05],
    snippet: 'Main carina and bilateral primary bronchi are widely patent.',
  },
  {
    terms: ['heart', 'cardiac', 'cardiomediastinal', 'cardiomegaly', 'pericardial'],
    preset: 'Lung / Air',
    id: 'cardiac',
    name: 'Cardiac Silhouette & Pericardium',
    category: 'Cardiovascular Silhouette',
    position: [-0.15, -0.15, 0.25],
    snippet: 'Cardiomediastinal contour is within normal limits.',
  },
  {
    terms: ['ethmoid', 'ethmoidal', 'cribriform', 'ethmoid air cells', 'ethmoid labyrinth'],
    preset: 'BP3D Sinus',
    id: 'bp3d_ethmoid',
    name: 'Ethmoid Bone & Air Cells (BP3D)',
    category: 'Anterior Skull Base',
    position: [0.0, 0.35, 0.15],
    snippet: 'Ethmoid air cells and cribriform plate demonstrate intact architecture.',
  },
  {
    terms: ['sphenoid', 'sphenoidal', 'sella turcica', 'sphenoid body', 'pterygoid'],
    preset: 'BP3D Sinus',
    id: 'bp3d_sphenoid',
    name: 'Sphenoid Bone & Sella (BP3D)',
    category: 'Central Skull Base',
    position: [0.0, 0.15, -0.45],
    snippet: 'Sphenoid body and pterygoid plates are symmetric and intact.',
  },
];

export const RadiologyViewer3D = ({
  audioLevel = 0,
  isRecording = false,
  onInsertFinding,
  transcript = '',
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const modelGroupRef = useRef(null);
  const markersRef = useRef([]);
  const modelsMapRef = useRef({});
  const pinpointRef = useRef(null);
  // Map of structureId -> THREE.Mesh for all individual nasal anatomy structures
  const nasalMeshesRef = useRef({});
  // Refs for real segmented meshes inside the loaded GLTF models
  const brainMeshesRef = useRef({ cortex: [], ventricles: [], cerebellum: [], brainstem: [], arteries: [] });
  const lungMeshesRef = useRef({ airway: [], upperLobe: [], lowerLobe: [], middleLobe: [] });
  const softTissueMeshesRef = useRef({ larynx: [], trachea: [], arteries: [] });
  // Ref for BodyParts3D OBJ meshes loaded dynamically from /models/bp3d/
  const bp3dMeshesRef = useRef({});
  const bp3dManifestRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  const [activePreset, setActivePreset] = useState('Bone');
  const [selectedLandmark, setSelectedLandmark] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  const [isWireframe, setIsWireframe] = useState(false);
  const [insertedLandmarkId, setInsertedLandmarkId] = useState(null);
  const [pinpointedLocation, setPinpointedLocation] = useState(null);
  // Hover tooltip state for individual 3D structure meshes
  const [hoveredStructure, setHoveredStructure] = useState(null); // { id, name, category, finding, color }
  const [modelLoading, setModelLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Keep autoRotateRef in sync with state
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // Mouse / touch interaction
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0.2, y: -0.4 });

  // 1. Initialize Scene and build all 4 distinct 3D anatomical models
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 420;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a0f1d);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.8, 5.0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 1.2);
    dirLight2.position.set(-5, -3, -5);
    scene.add(dirLight2);

    // Root Model Group
    const modelGroup = new THREE.Group();
    modelGroupRef.current = modelGroup;
    scene.add(modelGroup);

    // ==========================================
    // MODEL 1: BONE (Realistic Skull + Sinonasal Cavity)
    // ==========================================
    const boneGroup = new THREE.Group();
    boneGroup.name = 'Bone';

    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    gltfLoader.setDRACOLoader(dracoLoader);

    // Helper to auto-fit and center any loaded GLB model
    const fitModel = (model, targetSize = 2.7) => {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = targetSize / maxDim;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        model.position.sub(scaledCenter);
        model.updateMatrixWorld(true);
      }
    };

    // Load authentic photorealistic skull
    setModelLoading(true);
    setLoadingMessage('Loading High-Res 3D Skull [8.9 MB]...');

    gltfLoader.load(
      '/models/ScatteringSkull.glb',
      (gltf) => {
        const skull = gltf.scene;
        skull.name = 'Realistic_Skull_Mesh';
        skull.traverse((child) => {
          if (child.isMesh) {
            if (child.material) {
              child.material.roughness = 0.42;
              child.material.metalness = 0.05;
              child.material.needsUpdate = true;
            }
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.label = 'Cranial & Facial Skeleton';
          }
        });
        fitModel(skull, 2.75);
        boneGroup.add(skull);
        setModelLoading(false);
      },
      undefined,
      (err) => {
        console.error('Failed loading ScatteringSkull.glb:', err);
        setModelLoading(false);
      }
    );

    // ==========================================
    // INDIVIDUAL SINONASAL ANATOMY MESHES
    // Clinical-color coded: pathology=amber, variant=violet, normal=cyan
    // Positioned inside the piriform aperture of the realistic skull
    // ==========================================
    const nasalStructures = {};

    const makeClinicalMesh = (geo, clinicalColor, emissiveIntensity = 0.35) => {
      const mat = new THREE.MeshStandardMaterial({
        color: clinicalColor,
        emissive: clinicalColor,
        emissiveIntensity,
        roughness: 0.42,
        transparent: true,
        opacity: 0.82,
      });
      return new THREE.Mesh(geo, mat);
    };

    const makeTurbinateGeo = (rMinor, scaleX, scaleY, scaleZ) => {
      const geo = new THREE.TorusGeometry(rMinor, 0.055, 10, 28, Math.PI * 0.85);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) * scaleX, pos.getY(i) * scaleY, pos.getZ(i) * scaleZ);
      }
      geo.computeVertexNormals();
      return geo;
    };

    // — INFERIOR TURBINATES
    const infTurbGeo = makeTurbinateGeo(0.24, 0.9, 0.6, 0.85);
    const leftInfTurb = makeClinicalMesh(infTurbGeo, CLINICAL_COLORS.normal);
    leftInfTurb.position.set(-0.14, -0.10, 0.92);
    leftInfTurb.rotation.y = Math.PI / 2;
    leftInfTurb.name = 'left_inf_turbinate';
    leftInfTurb.userData.structureId = 'left_inf_turbinate';
    boneGroup.add(leftInfTurb);
    nasalStructures.left_inf_turbinate = leftInfTurb;

    const rightInfTurb = makeClinicalMesh(infTurbGeo.clone(), CLINICAL_COLORS.normal);
    rightInfTurb.position.set(0.14, -0.10, 0.92);
    rightInfTurb.rotation.y = -Math.PI / 2;
    rightInfTurb.name = 'right_inf_turbinate';
    rightInfTurb.userData.structureId = 'right_inf_turbinate';
    boneGroup.add(rightInfTurb);
    nasalStructures.right_inf_turbinate = rightInfTurb;

    // — MIDDLE TURBINATES
    const midTurbGeo = makeTurbinateGeo(0.19, 0.9, 0.52, 0.78);
    const leftMidTurb = makeClinicalMesh(midTurbGeo, CLINICAL_COLORS.normal);
    leftMidTurb.position.set(-0.12, 0.08, 0.88);
    leftMidTurb.rotation.y = Math.PI / 2;
    leftMidTurb.name = 'left_mid_turbinate';
    leftMidTurb.userData.structureId = 'left_mid_turbinate';
    boneGroup.add(leftMidTurb);
    nasalStructures.left_mid_turbinate = leftMidTurb;

    const rightMidTurb = makeClinicalMesh(midTurbGeo.clone(), CLINICAL_COLORS.normal);
    rightMidTurb.position.set(0.12, 0.08, 0.88);
    rightMidTurb.rotation.y = -Math.PI / 2;
    rightMidTurb.name = 'right_mid_turbinate';
    rightMidTurb.userData.structureId = 'right_mid_turbinate';
    boneGroup.add(rightMidTurb);
    nasalStructures.right_mid_turbinate = rightMidTurb;

    // — SUPERIOR TURBINATES
    const supTurbGeo = makeTurbinateGeo(0.12, 0.9, 0.45, 0.68);
    const leftSupTurb = makeClinicalMesh(supTurbGeo, CLINICAL_COLORS.normal);
    leftSupTurb.position.set(-0.10, 0.22, 0.84);
    leftSupTurb.rotation.y = Math.PI / 2;
    leftSupTurb.name = 'left_sup_turbinate';
    leftSupTurb.userData.structureId = 'left_sup_turbinate';
    boneGroup.add(leftSupTurb);
    nasalStructures.left_sup_turbinate = leftSupTurb;

    const rightSupTurb = makeClinicalMesh(supTurbGeo.clone(), CLINICAL_COLORS.normal);
    rightSupTurb.position.set(0.10, 0.22, 0.84);
    rightSupTurb.rotation.y = -Math.PI / 2;
    rightSupTurb.name = 'right_sup_turbinate';
    rightSupTurb.userData.structureId = 'right_sup_turbinate';
    boneGroup.add(rightSupTurb);
    nasalStructures.right_sup_turbinate = rightSupTurb;

    // — CONCHA BULLOSA
    const conchaBullosaGeo = new THREE.SphereGeometry(0.11, 14, 12);
    const leftConcha = makeClinicalMesh(conchaBullosaGeo, CLINICAL_COLORS.variant, 0.55);
    leftConcha.position.set(-0.12, 0.10, 0.86);
    leftConcha.name = 'left_concha_bullosa';
    leftConcha.userData.structureId = 'left_concha_bullosa';
    boneGroup.add(leftConcha);
    nasalStructures.left_concha_bullosa = leftConcha;

    const rightConchaBullosaGeo = new THREE.SphereGeometry(0.10, 14, 12);
    const rightConcha = makeClinicalMesh(rightConchaBullosaGeo, CLINICAL_COLORS.variant, 0.55);
    rightConcha.position.set(0.12, 0.10, 0.86);
    rightConcha.name = 'right_concha_bullosa';
    rightConcha.userData.structureId = 'right_concha_bullosa';
    boneGroup.add(rightConcha);
    nasalStructures.right_concha_bullosa = rightConcha;

    // — NASAL SEPTUM
    const septumGeo = new THREE.BoxGeometry(0.02, 0.55, 0.45);
    const septumMesh = makeClinicalMesh(septumGeo, CLINICAL_COLORS.normal, 0.25);
    septumMesh.position.set(0, 0.02, 0.86);
    septumMesh.name = 'nasal_septum';
    septumMesh.userData.structureId = 'nasal_septum';
    boneGroup.add(septumMesh);
    nasalStructures.nasal_septum = septumMesh;

    // — NASAL MUCOSA SHELLS
    const mucosaGeo = new THREE.TorusGeometry(0.26, 0.025, 8, 28, Math.PI * 0.78);
    const leftMucosa = makeClinicalMesh(mucosaGeo, CLINICAL_COLORS.normal, 0.3);
    leftMucosa.position.set(-0.15, -0.09, 0.92);
    leftMucosa.rotation.y = Math.PI / 2;
    leftMucosa.name = 'nasal_mucosa_left';
    leftMucosa.userData.structureId = 'nasal_mucosa_left';
    boneGroup.add(leftMucosa);
    nasalStructures.nasal_mucosa_left = leftMucosa;

    const rightMucosa = makeClinicalMesh(mucosaGeo.clone(), CLINICAL_COLORS.normal, 0.3);
    rightMucosa.position.set(0.15, -0.09, 0.92);
    rightMucosa.rotation.y = -Math.PI / 2;
    rightMucosa.name = 'nasal_mucosa_right';
    rightMucosa.userData.structureId = 'nasal_mucosa_right';
    boneGroup.add(rightMucosa);
    nasalStructures.nasal_mucosa_right = rightMucosa;

    nasalMeshesRef.current = nasalStructures;
    modelGroup.add(boneGroup);

    // ==========================================
    // MODEL 2: BRAIN (Real 437-part Z-Anatomy BodyParts3D Atlas)
    // ==========================================
    const brainGroup = new THREE.Group();
    brainGroup.name = 'Brain';
    brainGroup.visible = false;

    gltfLoader.load(
      '/models/brain.glb',
      (gltf) => {
        const brain = gltf.scene;
        brain.name = 'Realistic_Brain_Mesh';
        fitModel(brain, 2.6);

        const bRefs = { cortex: [], ventricles: [], cerebellum: [], brainstem: [], arteries: [] };

        brain.traverse((child) => {
          if (child.isMesh) {
            const name = child.name || '';
            child.userData.label = name.replace(/\./g, ' ').trim();
            child.userData.structureType = 'brain';

            if (/ventricl|choroid/i.test(name)) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0284c7,
                emissiveIntensity: 0.55,
                transparent: true,
                opacity: 0.88,
              });
              bRefs.ventricles.push(child);
            } else if (/artery|carotid|basilar/i.test(name)) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xef4444,
                emissive: 0x991b1b,
                emissiveIntensity: 0.45,
              });
              bRefs.arteries.push(child);
            } else if (/cerebell/i.test(name)) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xb0bec5,
                roughness: 0.55,
              });
              bRefs.cerebellum.push(child);
            } else if (/pons|medulla|stem|peduncle/i.test(name)) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x90a4ae,
                roughness: 0.45,
              });
              bRefs.brainstem.push(child);
            } else {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xd1d5db,
                roughness: 0.52,
                metalness: 0.05,
              });
              bRefs.cortex.push(child);
            }
          }
        });

        brainMeshesRef.current = bRefs;
        brainGroup.add(brain);
      },
      undefined,
      (err) => console.error('Failed loading brain.glb:', err)
    );

    modelGroup.add(brainGroup);

    // ========================================================
    // MODEL 3: SOFT TISSUE (Visible Human Larynx & Trachea + Carotids)
    // ========================================================
    const softTissueGroup = new THREE.Group();
    softTissueGroup.name = 'Soft Tissue';
    softTissueGroup.visible = false;

    const neckSubGroup = new THREE.Group();

    gltfLoader.load(
      '/models/VH_M_Larynx.glb',
      (gltf) => {
        const larynx = gltf.scene;
        larynx.traverse((c) => {
          if (c.isMesh) {
            c.material = new THREE.MeshStandardMaterial({
              color: 0xc4b5fd,
              emissive: 0x8b5cf6,
              emissiveIntensity: 0.25,
              roughness: 0.38,
            });
            c.userData.label = c.name.replace(/VH_M_/g, '').replace(/_/g, ' ');
          }
        });
        neckSubGroup.add(larynx);

        gltfLoader.load('/models/VH_M_Trachea.glb', (tracheaGltf) => {
          const trachea = tracheaGltf.scene;
          trachea.traverse((c) => {
            if (c.isMesh) {
              c.material = new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0284c7,
                emissiveIntensity: 0.25,
                roughness: 0.35,
              });
              c.userData.label = c.name.replace(/VH_M_/g, '').replace(/_/g, ' ');
            }
          });
          neckSubGroup.add(trachea);
          fitModel(neckSubGroup, 2.5);
        });
      },
      undefined,
      (err) => console.error('Failed loading Larynx/Trachea:', err)
    );

    // Bilateral Carotid Arteries (Contrast-enhanced vessels in red)
    const createArtery = (xOffset) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xOffset * 0.45, -1.3, 0.05),
        new THREE.Vector3(xOffset * 0.55, -0.6, 0.1),
        new THREE.Vector3(xOffset * 0.65, 0.1, 0.1),
        new THREE.Vector3(xOffset * 0.45, 0.7, 0.15),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.045, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0x991b1b,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(tubeGeo, tubeMat);
      mesh.userData.label = xOffset < 0 ? 'Left Common Carotid Artery' : 'Right Common Carotid Artery';
      return mesh;
    };
    softTissueGroup.add(createArtery(-1));
    softTissueGroup.add(createArtery(1));
    softTissueGroup.add(neckSubGroup);

    modelGroup.add(softTissueGroup);

    // ==========================================
    // MODEL 4: LUNG / THORAX (High-Res Bilateral Lungs + Tracheobronchial Tree)
    // ==========================================
    const lungGroup = new THREE.Group();
    lungGroup.name = 'Lung / Air';
    lungGroup.visible = false;

    gltfLoader.load(
      '/models/proper_lung.glb',
      (gltf) => {
        const lungs = gltf.scene;
        lungs.name = 'Realistic_Lung_Mesh';
        fitModel(lungs, 2.75);

        const lRefs = { airway: [], upperLobe: [], lowerLobe: [], middleLobe: [] };

        lungs.traverse((child) => {
          if (child.isMesh) {
            const name = child.name || '';
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.structureType = 'lung';

            if (/part02/i.test(name) || /airway|trachea|bronch/i.test(name)) {
              child.userData.label = 'Tracheobronchial Airway Tree';
              lRefs.airway.push(child);
            } else {
              child.userData.label = 'Pulmonary Lung Parenchyma';
              lRefs.lowerLobe.push(child);
              lRefs.upperLobe.push(child);
            }
          }
        });

        lungMeshesRef.current = lRefs;
        lungGroup.add(lungs);
      },
      undefined,
      (err) => console.error('Failed loading proper_lung.glb:', err)
    );

    modelGroup.add(lungGroup);

    // ========================================================
    // MODEL 5: BP3D SINUS & SKULL BASE (Authentic BodyParts3D OBJ Models)
    // ========================================================
    const bp3dGroup = new THREE.Group();
    bp3dGroup.name = 'BP3D Sinus';
    bp3dGroup.visible = false;

    // BodyParts3D orientation: Z is Up (superior), Y is Anterior-Posterior
    // In Three.js: Y is Up, Z is Forward/Back -> rotate -90 deg on X
    const bp3dOrientGroup = new THREE.Group();
    bp3dOrientGroup.rotation.x = -Math.PI / 2;
    bp3dGroup.add(bp3dOrientGroup);

    const objLoader = new OBJLoader();

    fetch('/models/bp3d/bp3d_manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest) => {
        if (!manifest || !manifest.structures) return;
        bp3dManifestRef.current = manifest.structures;
        const structures = manifest.structures;
        const loadedBP3D = {};

        Object.entries(structures).forEach(([key, info]) => {
          objLoader.load(
            `/models/bp3d/${info.file}`,
            (obj) => {
              obj.name = key;
              obj.traverse((child) => {
                if (child.isMesh) {
                  child.userData.structureId = key;
                  child.userData.label = info.name;
                  child.userData.category = info.category;
                  child.userData.finding = info.finding;
                  child.userData.isBP3D = true;

                  const colorHex = info.defaultColor || CLINICAL_COLORS.normal;
                  child.material = new THREE.MeshStandardMaterial({
                    color: colorHex,
                    emissive: colorHex,
                    emissiveIntensity: 0.25,
                    roughness: 0.38,
                    metalness: 0.05,
                    transparent: true,
                    opacity: 0.92,
                    side: THREE.DoubleSide,
                  });
                  loadedBP3D[key] = child;
                }
              });

              bp3dOrientGroup.add(obj);
              fitModel(bp3dGroup, 2.75);
              bp3dMeshesRef.current = loadedBP3D;
            },
            undefined,
            (err) => console.warn(`Could not load BP3D file ${info.file}:`, err)
          );
        });
      })
      .catch((err) => console.warn('BP3D manifest not available:', err));

    modelGroup.add(bp3dGroup);

    // Save references in modelsMapRef
    modelsMapRef.current = {
      Bone: boneGroup,
      Brain: brainGroup,
      'Soft Tissue': softTissueGroup,
      'Lung / Air': lungGroup,
      'BP3D Sinus': bp3dGroup,
    };

    // ==========================================
    // 3D LANDMARK PINS CONTAINER
    // ==========================================
    const markerGroup = new THREE.Group();
    markerGroup.name = 'MarkerGroup';
    modelGroup.add(markerGroup);
    markersRef.current = markerGroup;

    // ==========================================
    // 3D PINPOINT TARGET BEACON (Exact Place Highlighter)
    // ==========================================
    const pinpointGroup = new THREE.Group();
    pinpointGroup.name = 'ExactPinpointBeacon';
    pinpointGroup.visible = false;

    // Glowing core target sphere
    const coreDotGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const coreDotMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff0000,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const coreDot = new THREE.Mesh(coreDotGeo, coreDotMat);
    pinpointGroup.add(coreDot);

    // Primary targeting ring
    const outerRingGeo = new THREE.RingGeometry(0.24, 0.3, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    pinpointGroup.add(outerRing);

    // Secondary pulsing radar ripple ring
    const rippleRingGeo = new THREE.RingGeometry(0.42, 0.46, 32);
    const rippleRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const rippleRing = new THREE.Mesh(rippleRingGeo, rippleRingMat);
    pinpointGroup.add(rippleRing);

    // Crosshair reticle lines
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    const crossX = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.02), crossMat);
    const crossY = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.02), crossMat);
    pinpointGroup.add(crossX);
    pinpointGroup.add(crossY);

    // Directional pointer pin
    const pointerGeo = new THREE.ConeGeometry(0.08, 0.4, 16);
    const pointerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.7,
    });
    const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
    pointerMesh.rotation.x = Math.PI;
    pointerMesh.position.y = 0.32;
    pinpointGroup.add(pointerMesh);

    modelGroup.add(pinpointGroup);
    pinpointRef.current = {
      group: pinpointGroup,
      outerRing,
      rippleRing,
      pointerMesh,
    };

    // Animation Loop
    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (modelGroupRef.current) {
        if (autoRotateRef.current && !isDraggingRef.current) {
          targetRotationRef.current.y += 0.005;
        }
        modelGroupRef.current.rotation.y +=
          (targetRotationRef.current.y - modelGroupRef.current.rotation.y) * 0.1;
        modelGroupRef.current.rotation.x +=
          (targetRotationRef.current.x - modelGroupRef.current.rotation.x) * 0.1;
      }

      if (pinpointRef.current?.group?.visible) {
        const t = clock.getElapsedTime();
        const pulse = 1.0 + Math.sin(t * 6) * 0.22;
        const ripple = 1.0 + Math.sin(t * 3.5) * 0.35;
        pinpointRef.current.outerRing.scale.set(pulse, pulse, pulse);
        pinpointRef.current.outerRing.rotation.z += 0.02;
        pinpointRef.current.rippleRing.scale.set(ripple, ripple, ripple);
        pinpointRef.current.rippleRing.rotation.z -= 0.015;
        pinpointRef.current.pointerMesh.position.y = 0.32 + Math.sin(t * 8) * 0.05;
      }

      dirLight2.intensity = 0.8 + audioLevel * 2.5;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  // 2. Switch 3D Model when activePreset changes (Bone vs Brain vs Soft Tissue vs Lung)
  useEffect(() => {
    // Show only the selected 3D model
    const map = modelsMapRef.current;
    if (map) {
      Object.entries(map).forEach(([key, group]) => {
        if (group) {
          group.visible = (key === activePreset);
        }
      });
    }

    // Rebuild 3D landmark pins for this specific anatomy
    const markerGroup = markersRef.current;
    if (markerGroup && markerGroup.children) {
      // Clear old pins
      while (markerGroup.children.length > 0) {
        const obj = markerGroup.children[0];
        markerGroup.remove(obj);
      }

      const activeLandmarks = ANATOMICAL_LANDMARKS[activePreset] || [];
      activeLandmarks.forEach((lm) => {
        const pinGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const pinMat = new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: 0x06b6d4,
          roughness: 0.2,
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(...lm.position);
        pin.userData = { landmark: lm };

        const pinRingGeo = new THREE.RingGeometry(0.1, 0.14, 16);
        const pinRingMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const pinRing = new THREE.Mesh(pinRingGeo, pinRingMat);
        pin.add(pinRing);

        markerGroup.add(pin);
      });
    }

    // Clear selected landmark if it doesn't belong to new preset
    setSelectedLandmark(null);
  }, [activePreset]);

  // 3. Auto-detect anatomical terms in description / transcript and pinpoint exact place on 3D model
  useEffect(() => {
    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      if (pinpointRef.current?.group) {
        pinpointRef.current.group.visible = false;
      }
      setPinpointedLocation(null);
      return;
    }

    const lower = transcript.toLowerCase();
    let bestMatch = null;
    let highestPos = -1;

    for (const rule of PINPOINT_RULES) {
      for (const term of rule.terms) {
        const idx = lower.lastIndexOf(term.toLowerCase());
        if (idx > highestPos) {
          highestPos = idx;
          bestMatch = { ...rule, matchedTerm: term };
        }
      }
    }

    if (bestMatch) {
      setPinpointedLocation(bestMatch);

      // Auto-switch to corresponding 3D organ/tissue model if needed
      if (bestMatch.preset && bestMatch.preset !== activePreset) {
        setActivePreset(bestMatch.preset);
      }

      // Position the 3D pinpoint beacon at the exact coordinates
      if (pinpointRef.current?.group) {
        pinpointRef.current.group.position.set(...bestMatch.position);
        pinpointRef.current.group.visible = true;
      }

      // Smoothly orient 3D camera to highlight the exact place
      const [px, py, pz] = bestMatch.position;
      targetRotationRef.current = {
        x: Math.max(-0.25, Math.min(0.25, -py * 0.2)),
        y: Math.atan2(px, pz),
      };
      autoRotateRef.current = false;
      setAutoRotate(false);
    }
  }, [transcript]);

  // 5. When transcript matches a PINPOINT_RULE, also clinically color the individual nasal meshes
  useEffect(() => {
    const meshes = nasalMeshesRef.current;
    if (!meshes || Object.keys(meshes).length === 0) return;

    // Helper: reset all meshes to their default clinical color
    const resetMeshColors = () => {
      Object.entries(meshes).forEach(([id, mesh]) => {
        const meta = STRUCTURE_META[id];
        if (meta && mesh.material) {
          mesh.material.color.setHex(meta.defaultColor);
          mesh.material.emissive.setHex(meta.defaultColor);
          mesh.material.emissiveIntensity = id.includes('concha') ? 0.55 : 0.35;
        }
      });
    };

    if (!transcript || !transcript.trim()) {
      resetMeshColors();
      return;
    }

    const lower = transcript.toLowerCase();

    // Color concha bullosa (violet) if mentioned
    const conchaTerms = ['concha bullosa', 'concha', 'left concha', 'right concha', 'concha b'];
    if (conchaTerms.some(t => lower.includes(t))) {
      ['left_concha_bullosa', 'right_concha_bullosa'].forEach(id => {
        if (meshes[id]) {
          meshes[id].material.color.setHex(CLINICAL_COLORS.variant);
          meshes[id].material.emissive.setHex(CLINICAL_COLORS.variant);
          meshes[id].material.emissiveIntensity = 0.85;
        }
      });
    }

    // Color turbinate hypertrophy (amber)
    if (lower.includes('turbinate') || lower.includes('hypertrophy') || lower.includes('turbinates')) {
      const sideLeft  = lower.includes('left')  || lower.includes('bilateral') || (!lower.includes('right'));
      const sideRight = lower.includes('right') || lower.includes('bilateral') || (!lower.includes('left'));
      if (sideLeft)  {
        ['left_inf_turbinate', 'left_mid_turbinate'].forEach(id => {
          if (meshes[id]) {
            meshes[id].material.color.setHex(CLINICAL_COLORS.pathology);
            meshes[id].material.emissive.setHex(CLINICAL_COLORS.pathology);
            meshes[id].material.emissiveIntensity = 0.75;
          }
        });
      }
      if (sideRight) {
        ['right_inf_turbinate', 'right_mid_turbinate'].forEach(id => {
          if (meshes[id]) {
            meshes[id].material.color.setHex(CLINICAL_COLORS.pathology);
            meshes[id].material.emissive.setHex(CLINICAL_COLORS.pathology);
            meshes[id].material.emissiveIntensity = 0.75;
          }
        });
      }
    }

    // Color nasal mucosal thickening (amber on mucosa)
    if (lower.includes('mucosal') || lower.includes('mucosa') || lower.includes('sinusitis') || lower.includes('mucosal thickening')) {
      ['nasal_mucosa_left', 'nasal_mucosa_right'].forEach(id => {
        if (meshes[id]) {
          meshes[id].material.color.setHex(CLINICAL_COLORS.pathology);
          meshes[id].material.emissive.setHex(CLINICAL_COLORS.pathology);
          meshes[id].material.emissiveIntensity = 0.7;
        }
      });
    }

    // Brain findings illumination
    const bMeshes = brainMeshesRef.current;
    if (bMeshes) {
      if (lower.includes('ventricl') || lower.includes('hydrocephalus')) {
        bMeshes.ventricles.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.pathology);
            m.material.emissive.setHex(CLINICAL_COLORS.pathology);
            m.material.emissiveIntensity = 0.85;
          }
        });
      }
      if (lower.includes('no acute intracranial') || lower.includes('no hemorrhage')) {
        bMeshes.cortex.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.negative);
            m.material.emissive.setHex(CLINICAL_COLORS.negative);
            m.material.emissiveIntensity = 0.35;
          }
        });
      } else if (lower.includes('hemorrhage') || lower.includes('acute bleed')) {
        bMeshes.cortex.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.alert);
            m.material.emissive.setHex(CLINICAL_COLORS.alert);
            m.material.emissiveIntensity = 0.75;
          }
        });
      }
      if (lower.includes('cerebell')) {
        bMeshes.cerebellum.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.pathology);
            m.material.emissive.setHex(CLINICAL_COLORS.pathology);
            m.material.emissiveIntensity = 0.75;
          }
        });
      }
      if (lower.includes('stem') || lower.includes('pons')) {
        bMeshes.brainstem.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.variant);
            m.material.emissive.setHex(CLINICAL_COLORS.variant);
            m.material.emissiveIntensity = 0.75;
          }
        });
      }
    }

    // Lung findings illumination
    const lMeshes = lungMeshesRef.current;
    if (lMeshes) {
      if (lower.includes('atelectasis') || lower.includes('consolidation') || lower.includes('pneumonia')) {
        lMeshes.lowerLobe.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.pathology);
            m.material.emissive.setHex(CLINICAL_COLORS.pathology);
            m.material.emissiveIntensity = 0.85;
          }
        });
      }
      if (lower.includes('pneumothorax')) {
        lMeshes.upperLobe.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.alert);
            m.material.emissive.setHex(CLINICAL_COLORS.alert);
            m.material.emissiveIntensity = 0.85;
          }
        });
      }
      if (lower.includes('bronch') || lower.includes('trachea')) {
        lMeshes.airway.forEach((m) => {
          if (m.material) {
            m.material.color.setHex(CLINICAL_COLORS.variant);
            m.material.emissive.setHex(CLINICAL_COLORS.variant);
            m.material.emissiveIntensity = 0.7;
          }
        });
      }
    }

    // BodyParts3D (BP3D) findings illumination
    const bp3dMeshes = bp3dMeshesRef.current;
    const bp3dManifest = bp3dManifestRef.current;
    if (bp3dMeshes && bp3dManifest) {
      if (!transcript || !transcript.trim()) {
        Object.entries(bp3dMeshes).forEach(([k, m]) => {
          const info = bp3dManifest[k];
          const origCol = info?.defaultColor || CLINICAL_COLORS.normal;
          if (m.material) {
            m.material.color.setHex(origCol);
            m.material.emissive.setHex(origCol);
            m.material.emissiveIntensity = 0.25;
          }
        });
      } else {
        // Concha / Turbinates
        if (lower.includes('turbinate') || lower.includes('concha')) {
          ['FJ3263', 'FJ3369'].forEach((k) => {
            if (bp3dMeshes[k]?.material) {
              bp3dMeshes[k].material.color.setHex(CLINICAL_COLORS.pathology);
              bp3dMeshes[k].material.emissive.setHex(CLINICAL_COLORS.pathology);
              bp3dMeshes[k].material.emissiveIntensity = 0.85;
            }
          });
        }
        // Nasal Septum / Vomer
        if (lower.includes('septum') || lower.includes('septal') || lower.includes('vomer') || lower.includes('deviation')) {
          ['FJ2557', 'FJ3395'].forEach((k) => {
            if (bp3dMeshes[k]?.material) {
              bp3dMeshes[k].material.color.setHex(CLINICAL_COLORS.variant);
              bp3dMeshes[k].material.emissive.setHex(CLINICAL_COLORS.variant);
              bp3dMeshes[k].material.emissiveIntensity = 0.85;
            }
          });
        }
        // Ethmoid
        if (lower.includes('ethmoid') || lower.includes('ethmoidal') || lower.includes('cribriform')) {
          if (bp3dMeshes.FJ3199?.material) {
            bp3dMeshes.FJ3199.material.color.setHex(CLINICAL_COLORS.pathology);
            bp3dMeshes.FJ3199.material.emissive.setHex(CLINICAL_COLORS.pathology);
            bp3dMeshes.FJ3199.material.emissiveIntensity = 0.85;
          }
        }
        // Sphenoid
        if (lower.includes('sphenoid') || lower.includes('sphenoidal') || lower.includes('sella')) {
          if (bp3dMeshes.FJ3394?.material) {
            bp3dMeshes.FJ3394.material.color.setHex(CLINICAL_COLORS.normal);
            bp3dMeshes.FJ3394.material.emissive.setHex(CLINICAL_COLORS.normal);
            bp3dMeshes.FJ3394.material.emissiveIntensity = 0.85;
          }
        }
      }
    }
  }, [transcript]);

  // Toggle Wireframe
  const toggleWireframe = () => {
    setIsWireframe((prev) => {
      const next = !prev;
      const activeGroup = modelsMapRef.current[activePreset];
      if (activeGroup) {
        activeGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.wireframe = next;
          }
        });
      }
      return next;
    });
  };

  const handleResetView = () => {
    targetRotationRef.current = { x: 0.2, y: -0.4 };
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0.8, 5.0);
    }
  };

  const handleZoom = (factor) => {
    if (!cameraRef.current) return;
    cameraRef.current.position.z = Math.max(2.5, Math.min(8.0, cameraRef.current.position.z * factor));
  };

  // Mouse drag orbiting + raycasting hover on all detailed anatomy meshes
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    // 1. Orbit drag
    if (isDraggingRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      targetRotationRef.current.y += deltaX * 0.008;
      targetRotationRef.current.x = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, targetRotationRef.current.x + deltaY * 0.008)
      );
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    }

    // 2. Raycast hover over active model anatomy meshes
    if (rendererRef.current && cameraRef.current && modelsMapRef.current) {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera({ x: mx, y: my }, cameraRef.current);

      let hitMesh = null;
      let sid = null;
      let meta = null;

      if (activePreset === 'Bone' && nasalMeshesRef.current) {
        const nasalMeshes = Object.values(nasalMeshesRef.current);
        const nasalHits = raycasterRef.current.intersectObjects(nasalMeshes, false);
        if (nasalHits.length > 0) {
          hitMesh = nasalHits[0].object;
          sid = hitMesh.userData?.structureId;
          meta = sid ? STRUCTURE_META[sid] : null;
        }
      }

      if (activePreset === 'BP3D Sinus' && bp3dMeshesRef.current) {
        const bp3dList = Object.values(bp3dMeshesRef.current);
        const bpHits = raycasterRef.current.intersectObjects(bp3dList, false);
        if (bpHits.length > 0) {
          hitMesh = bpHits[0].object;
          sid = hitMesh.userData?.structureId;
          const bpMeta = bp3dManifestRef.current?.[sid];
          if (bpMeta) {
            meta = {
              name: bpMeta.name,
              category: bpMeta.category,
              finding: bpMeta.finding,
            };
          }
        }
      }

      if (!hitMesh) {
        const activeGroup = modelsMapRef.current[activePreset];
        if (activeGroup) {
          const hits = raycasterRef.current.intersectObjects(activeGroup.children, true);
          if (hits.length > 0) {
            hitMesh = hits[0].object;
            sid = hitMesh.userData?.structureId;
            meta = sid ? STRUCTURE_META[sid] : null;
          }
        }
      }

      if (hitMesh) {
        const label = hitMesh.userData?.label || hitMesh.name;
        if (meta && sid !== hoveredStructure?.id) {
          const col = hitMesh.material?.color || new THREE.Color(0x3ecfe0);
          setHoveredStructure({
            id: sid,
            name: meta.name,
            category: meta.category,
            finding: meta.finding,
            hexColor: `#${col.getHexString()}`,
          });
        } else if (label && label.length > 2 && label !== 'Realistic_Skull_Mesh' && (!hoveredStructure || hoveredStructure.id !== label)) {
          const cleanName = label
            .replace(/\.l\b/i, ' (Left)')
            .replace(/\.r\b/i, ' (Right)')
            .replace(/VH_[FM]_/g, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const col = hitMesh.material?.color || new THREE.Color(0x38bdf8);
          setHoveredStructure({
            id: label,
            name: cleanName,
            category: `${activePreset} Anatomy`,
            finding: `High-resolution segmented 3D structure (${cleanName}).`,
            hexColor: `#${col.getHexString()}`,
          });
        }
      } else {
        if (hoveredStructure !== null) setHoveredStructure(null);
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeaveCanvas = () => {
    isDraggingRef.current = false;
    setHoveredStructure(null);
  };

  // Touch handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - previousMousePositionRef.current.x;
    const deltaY = e.touches[0].clientY - previousMousePositionRef.current.y;

    targetRotationRef.current.y += deltaX * 0.01;
    targetRotationRef.current.x = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 3, targetRotationRef.current.x + deltaY * 0.01)
    );

    previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleInsertFinding = (landmark) => {
    if (onInsertFinding) {
      onInsertFinding(landmark.finding);
      setInsertedLandmarkId(landmark.id);
      setTimeout(() => setInsertedLandmarkId(null), 2000);
    }
  };

  const currentLandmarks = ANATOMICAL_LANDMARKS[activePreset] || [];

  return (
    <div className="radiology-3d-card glass-panel-white">
      {/* 3D Viewport Header */}
      <div className="viewer-3d-header">
        <div className="viewer-3d-title">
          <div className="scan-indicator-badge">
            <span className="scan-dot" />
            <span>3D {activePreset.toUpperCase()} SCAN</span>
          </div>
        </div>

        <div className="viewer-3d-toolbar">
          <button
            type="button"
            className="black-icon-btn"
            onClick={() => {
              const next = !autoRotate;
              autoRotateRef.current = next;
              // Snap target to current rotation so easing stops immediately
              if (!next && modelGroupRef.current) {
                targetRotationRef.current = {
                  x: modelGroupRef.current.rotation.x,
                  y: modelGroupRef.current.rotation.y,
                };
              }
              setAutoRotate(next);
            }}
            title={autoRotate ? 'Pause 3D rotation' : 'Resume auto rotation'}
          >
            <RotateCw size={14} className={autoRotate ? 'spin-slow' : ''} />
            <span>{autoRotate ? 'Rotating' : 'Static'}</span>
          </button>

          <button
            type="button"
            className="black-icon-btn"
            onClick={toggleWireframe}
            title="Toggle Volumetric Wireframe / Solid"
          >
            <Eye size={14} />
            <span>{isWireframe ? 'Solid' : 'Wireframe'}</span>
          </button>

          <button
            type="button"
            className="black-icon-btn"
            onClick={() => handleZoom(0.85)}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            className="black-icon-btn"
            onClick={() => handleZoom(1.18)}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            className="black-icon-btn"
            onClick={handleResetView}
            title="Reset Camera Orientation"
          >
            <Crosshair size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main 3D WebGL Canvas Deck */}
      <div
        ref={mountRef}
        className="viewer-3d-canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeaveCanvas}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Active Scan & Audio Telemetry Overlay */}
        <div className="scanner-telemetry-badge">
          <Activity size={13} style={{ color: isRecording ? '#10b981' : '#94a3b8' }} />
          <span>SCAN: {activePreset.toUpperCase()} {isRecording ? `// LIVE ${Math.round(audioLevel * 100)}%` : '// STANDBY'}</span>
        </div>

        {/* Realtime 3D Model Loading HUD */}
        {modelLoading && (
          <div className="viewer-3d-loading-overlay">
            <div className="viewer-3d-loading-spinner" />
            <span className="viewer-3d-loading-text">{loadingMessage || 'Streaming 3D Medical Scan...'}</span>
          </div>
        )}

        {/* Individual Anatomy Structure Hover Tooltip */}
        {hoveredStructure && (
          <div className="anatomy-hover-tooltip">
            <div className="anatomy-hover-color-bar" style={{ background: hoveredStructure.hexColor }} />
            <div className="anatomy-hover-content">
              <div className="anatomy-hover-name">
                <MapPin size={11} style={{ color: hoveredStructure.hexColor, flexShrink: 0 }} />
                {hoveredStructure.name}
              </div>
              <div className="anatomy-hover-category">{hoveredStructure.category}</div>
              <div className="anatomy-hover-finding">{hoveredStructure.finding}</div>
            </div>
          </div>
        )}

        {/* Exact Pinpoint Location HUD Badge (Triggered by text in description field) */}
        {pinpointedLocation && (
          <div className="pinpoint-location-hud">
            <div className="pinpoint-hud-header">
              <div className="pinpoint-badge-tag">
                <span className="pinpoint-pulse-dot" />
                <span>EXACT SITE PINPOINTED</span>
              </div>
              <button
                type="button"
                className="close-hud-btn"
                onClick={() => {
                  setPinpointedLocation(null);
                  if (pinpointRef.current?.group) {
                    pinpointRef.current.group.visible = false;
                  }
                }}
                title="Dismiss Pinpoint"
              >
                ✕
              </button>
            </div>
            <div className="pinpoint-hud-title">{pinpointedLocation.name}</div>
            <div className="pinpoint-hud-meta-row">
              <span className="pinpoint-meta-item">Region: {pinpointedLocation.category}</span>
              <span className="pinpoint-meta-item">
                3D: [{pinpointedLocation.position?.map((c) => c.toFixed(2)).join(', ')}]
              </span>
            </div>
            {pinpointedLocation.matchedTerm && (
              <div className="pinpoint-hud-matched">
                Auto-detected: <strong>"{pinpointedLocation.matchedTerm}"</strong>
              </div>
            )}
          </div>
        )}

        {/* Selected Landmark HUD Card */}
        {selectedLandmark && (
          <div className="landmark-hud-overlay">
            <div className="landmark-hud-header">
              <span className="landmark-hud-category">{selectedLandmark.category}</span>
              <button
                type="button"
                className="close-hud-btn"
                onClick={() => setSelectedLandmark(null)}
              >
                ✕
              </button>
            </div>
            <div className="landmark-hud-title">{selectedLandmark.name}</div>
            <div className="landmark-hud-body">{selectedLandmark.finding}</div>
            <button
              type="button"
              className="black-action-btn small full-width"
              onClick={() => handleInsertFinding(selectedLandmark)}
            >
              {insertedLandmarkId === selectedLandmark.id ? (
                <>
                  <CheckCircle2 size={13} style={{ color: '#34d399' }} />
                  <span>Inserted into Report</span>
                </>
              ) : (
                <>
                  <PlusCircle size={13} />
                  <span>Insert Clinical Finding</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Anatomical Scan Presets */}
      <div className="viewer-3d-controls-deck">
        {/* Anatomical 3D Scan Selector (Bone, Brain, Soft Tissue, Lung) */}
        <div className="hu-presets-group">
          <span className="deck-label">3D Scan:</span>
          <div className="hu-pill-row">
            {HU_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className={`hu-preset-btn ${activePreset === p.name ? 'active' : ''}`}
                onClick={() => setActivePreset(p.name)}
                title={`Switch 3D anatomical scan to ${p.label} (${p.wl})`}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Anatomical Landmark Pin Navigation */}
      <div className="landmark-quick-strip">
        <span className="deck-label">Regions:</span>
        <div className="landmark-pills-scroll">
          {currentLandmarks.map((lm) => (
            <button
              key={lm.id}
              type="button"
              className={`landmark-pill-btn ${selectedLandmark?.id === lm.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedLandmark(lm);
                if (pinpointRef.current?.group) {
                  pinpointRef.current.group.position.set(...lm.position);
                  pinpointRef.current.group.visible = true;
                }
                setPinpointedLocation({
                  name: lm.name,
                  category: lm.category,
                  position: lm.position,
                  preset: activePreset,
                  snippet: lm.finding,
                });
                targetRotationRef.current = {
                  x: 0.1,
                  y: Math.atan2(lm.position[0], lm.position[2]),
                };
              }}
            >
              <span>{lm.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* BodyParts3D Model License & Provenance Credit */}
      <div className="viewer-3d-attribution">
        <span>Anatomy Models: <a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noopener noreferrer">BodyParts3D</a> (© DBCLS, CC BY 4.0)</span>
        <span style={{ opacity: 0.75 }}>Selective OBJ Pipeline Active</span>
      </div>
    </div>
  );
};
