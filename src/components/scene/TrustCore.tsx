'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './Materials';

interface TrustCoreProps {
  status?: 'idle' | 'evaluating' | 'verified' | 'contradiction' | 'recovery';
  scale?: number;
  highlighted?: boolean;
}

export const TrustCore: React.FC<TrustCoreProps> = ({
  status = 'idle',
  scale = 1.0,
  highlighted = false,
}) => {
  const coreGemRef = useRef<THREE.Mesh>(null);
  const dialRingRef = useRef<THREE.Group>(null);
  const semanticConduitRef = useRef<THREE.Mesh>(null);
  const technicalConduitRef = useRef<THREE.Mesh>(null);

  // Status color determination
  const activeColor =
    status === 'verified'
      ? PALETTE.greenGlow
      : status === 'contradiction'
      ? PALETTE.redGlow
      : status === 'recovery'
      ? PALETTE.amberGlow
      : PALETTE.cyanGlow;

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Subtle gentle core rotation
    if (coreGemRef.current) {
      coreGemRef.current.rotation.y += delta * (status === 'evaluating' ? 1.4 : 0.6);
      coreGemRef.current.rotation.z += delta * 0.3;
      const s = 1 + Math.sin(t * 2.5) * 0.05;
      coreGemRef.current.scale.set(s, s, s);
    }

    // Dial slow calibrated oscillation
    if (dialRingRef.current) {
      dialRingRef.current.rotation.z = Math.sin(t * 0.8) * 0.08;
    }
  });

  return (
    <group scale={scale}>
      {/* ============================================================== */}
      {/* 1. PRECISION AVIONICS BEZEL & SATIN DIAL FACE                  */}
      {/* ============================================================== */}
      {/* Precision Satin Silver Outer Chamfer Bezel */}
      <mesh position={[0, 0, 0.008]}>
        <ringGeometry args={[0.216, 0.246, 64]} />
        <meshStandardMaterial
          color={PALETTE.satinSilver}
          metalness={0.88}
          roughness={0.18}
        />
      </mesh>

      {/* Stepped Inner Graphite Retaining Rim */}
      <mesh position={[0, 0, 0.006]}>
        <ringGeometry args={[0.205, 0.218, 48]} />
        <meshStandardMaterial
          color={PALETTE.jointGraphite}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Deep Obsidian Titanium Instrument Face (Uniform, non-shadowed) */}
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[0.206, 64]} />
        <meshStandardMaterial
          color="#0a101d"
          metalness={0.75}
          roughness={0.30}
        />
      </mesh>

      {/* ============================================================== */}
      {/* 2. CALIBRATED INSTRUMENT RETICLE & 12 LASER-ETCHED TICKS       */}
      {/* ============================================================== */}
      <group ref={dialRingRef} position={[0, 0, 0.004]}>
        {/* Outer Concentric Calibration Ring */}
        <mesh>
          <ringGeometry args={[0.160, 0.167, 64]} />
          <meshBasicMaterial color={activeColor} />
        </mesh>
        {/* Inner Accuracy Reticle Ring */}
        <mesh>
          <ringGeometry args={[0.116, 0.121, 48]} />
          <meshBasicMaterial color={activeColor} />
        </mesh>
        {/* 12 Laser-Etched Metric Calibration Marks */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
          const angle = (i / 12) * Math.PI * 2;
          const isMajor = i % 3 === 0;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 0.144, Math.sin(angle) * 0.144, 0]}
              rotation={[0, 0, angle]}
            >
              <planeGeometry args={[isMajor ? 0.024 : 0.013, 0.004]} />
              <meshBasicMaterial color={activeColor} />
            </mesh>
          );
        })}
      </group>

      {/* ============================================================== */}
      {/* 3. DUAL VERIFICATION CONDUITS (Semantic Left, Technical Right)  */}
      {/* ============================================================== */}
      {/* Left: DeBERTa Semantic Entailment Waveguide */}
      <group position={[-0.082, 0, 0.006]}>
        <mesh ref={semanticConduitRef} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.08, 16]} />
          <meshStandardMaterial
            color={activeColor}
            emissive={activeColor}
            emissiveIntensity={status !== 'idle' ? 2.5 : 0.9}
            roughness={0.15}
            metalness={0.4}
          />
        </mesh>
        <mesh position={[-0.042, 0, 0]}>
          <boxGeometry args={[0.009, 0.022, 0.010]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0.042, 0, 0]}>
          <boxGeometry args={[0.009, 0.022, 0.010]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* Right: Deterministic Engineering Checks Waveguide */}
      <group position={[0.082, 0, 0.006]}>
        <mesh ref={technicalConduitRef} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.08, 16]} />
          <meshStandardMaterial
            color={activeColor}
            emissive={activeColor}
            emissiveIntensity={status !== 'idle' ? 2.5 : 0.9}
            roughness={0.15}
            metalness={0.4}
          />
        </mesh>
        <mesh position={[-0.042, 0, 0]}>
          <boxGeometry args={[0.009, 0.022, 0.010]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0.042, 0, 0]}>
          <boxGeometry args={[0.009, 0.022, 0.010]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 4. SIGNATURE VERIFICATION PRISM CORE (Layered Depth)           */}
      {/* ============================================================== */}
      <mesh ref={coreGemRef} position={[0, 0, 0.008]}>
        <octahedronGeometry args={[0.070, 0]} />
        <meshPhysicalMaterial
          color={activeColor}
          emissive={activeColor}
          emissiveIntensity={status === 'verified' ? 2.6 : status === 'contradiction' ? 2.4 : 1.0}
          roughness={0.08}
          metalness={0.18}
          clearcoat={1.0}
          clearcoatRoughness={0.04}
          transparent
          opacity={0.92}
        />
      </mesh>

      <mesh position={[0, 0, 0.008]}>
        <octahedronGeometry args={[0.028, 0]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={status === 'idle' ? 0.85 : 1.0}
        />
      </mesh>

      {/* ============================================================== */}
      {/* 5. PROTECTIVE SAPPHIRE CRYSTAL LENS (Crystal Clear Watch Glass)*/}
      {/* ============================================================== */}
      <mesh position={[0, 0, 0.014]}>
        <circleGeometry args={[0.205, 48]} />
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0.03}
          metalness={0.08}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          transparent
          opacity={0.18}
        />
      </mesh>
      <mesh position={[0, 0, 0.0145]}>
        <ringGeometry args={[0.198, 0.206, 48]} />
        <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
};
