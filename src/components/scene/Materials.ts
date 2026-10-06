import * as THREE from 'three';

// Premium Product-Design Palette: Clean, Light-Themed, Friendly-but-Serious
export const PALETTE = {
  // Primary Shells (Pearl / Ceramic White, soft and premium)
  pearlWhite: '#fdfdfd',
  pearlWhiteShaded: '#f3f4f6',
  warmGrey: '#e5e7eb',
  neutralGrey: '#cbd5e1',

  // Joints, Hinges & Technical Chassis
  jointGraphite: '#475569',
  metalTrim: '#94a3b8',
  satinSilver: '#e2e8f0',
  seamDark: '#334155',

  // Visor & Optical Glass
  visorGlass: '#090d16',
  lensClear: '#ffffff',

  // System Semantic Illumination (Restrained, purposeful, not neon flood)
  cyanSignal: '#0284c7',
  cyanGlow: '#00b4d8',
  cyanSoft: '#38bdf8',
  greenGlow: '#10b981',
  greenSoft: '#34d399',
  amberGlow: '#f59e0b',
  redGlow: '#ef4444',
  whiteHot: '#ffffff',

  // UI & Canvas Theme
  bgLight: '#fafafb',
  bgSoft: '#f7f8fa',
  textDark: '#0f172a',
  textMuted: '#64748b',
};

// Reusable standard materials with clear readability and soft satin specularity
export const createPearlWhiteMaterial = (roughness = 0.28, metalness = 0.08) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.pearlWhite),
    roughness,
    metalness,
    envMapIntensity: 1.0,
  });
};

export const createWarmGreyMaterial = (roughness = 0.32, metalness = 0.12) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.warmGrey),
    roughness,
    metalness,
    envMapIntensity: 1.0,
  });
};

export const createJointMaterial = (roughness = 0.38, metalness = 0.6) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.jointGraphite),
    roughness,
    metalness,
    envMapIntensity: 1.2,
  });
};

export const createSatinSilverMaterial = (roughness = 0.25, metalness = 0.85) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.satinSilver),
    roughness,
    metalness,
    envMapIntensity: 1.4,
  });
};

export const createVisorGlassMaterial = () => {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PALETTE.visorGlass),
    roughness: 0.06,
    metalness: 0.1,
    transmission: 0.35,
    thickness: 0.3,
    ior: 1.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.96,
  });
};

export const createProtectiveLensMaterial = () => {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PALETTE.lensClear),
    roughness: 0.04,
    metalness: 0.05,
    transmission: 0.88,
    thickness: 0.4,
    ior: 1.5,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.75,
  });
};

export const createEmissiveMaterial = (color: string, intensity = 1.4, transparent = true, opacity = 0.95) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    transparent,
    opacity,
    roughness: 0.15,
    metalness: 0.1,
  });
};
