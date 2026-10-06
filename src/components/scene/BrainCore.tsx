'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { ActiveBodyRegion } from '../../types/architecture';
import { PALETTE } from './Materials';

interface BrainCoreProps {
  explodeProgress?: number;
  highlighted?: boolean;
  activeRegion?: ActiveBodyRegion;
  showHybridSplit?: boolean;
  showRerankLattice?: boolean;
  showGenerationCore?: boolean;
  pointerPos?: { x: number; y: number };
}

export const BrainCore: React.FC<BrainCoreProps> = ({
  explodeProgress = 0,
  highlighted = false,
  activeRegion = 'idle',
  showHybridSplit = false,
  showRerankLattice = false,
  showGenerationCore = false,
  pointerPos = { x: 0, y: 0 },
}) => {
  const headGroupRef = useRef<THREE.Group>(null);
  const crownPanelRef = useRef<THREE.Group>(null);
  const leftCranialShellRef = useRef<THREE.Group>(null);
  const rightCranialShellRef = useRef<THREE.Group>(null);
  const internalBayRef = useRef<THREE.Group>(null);
  const headShellMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const visorGlassMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // Visor elements
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const gazeGroupRef = useRef<THREE.Group>(null);

  // Internal retrieval components
  const queryNodeRef = useRef<THREE.Mesh>(null);
  const qdrantClusterRef = useRef<THREE.Group>(null);
  const tantivyBandsRef = useRef<THREE.Group>(null);
  const networkxGraphRef = useRef<THREE.Group>(null);
  const rrfConvergenceRef = useRef<THREE.Group>(null);
  const flashrankGateRef = useRef<THREE.Group>(null);
  const geminiCrystalRef = useRef<THREE.Mesh>(null);
  const draftEgressRef = useRef<THREE.Mesh>(null);

  // Candidate streams
  const packetDenseRef = useRef<THREE.Mesh>(null);
  const packetLexicalRef = useRef<THREE.Mesh>(null);
  const packetGraphRef = useRef<THREE.Mesh>(null);

  // Subsystem focus check
  const isBrainFocused = highlighted || showHybridSplit || showRerankLattice || showGenerationCore;
  const targetOpen = isBrainFocused ? 1.0 : 0.0;
  const currentOpen = useRef(0);

  // Blink and gaze state
  const blinkTimer = useRef(0);
  const isBlinking = useRef(false);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Smooth transition of precision opening
    currentOpen.current = THREE.MathUtils.lerp(currentOpen.current, targetOpen, Math.min(1.0, delta * 4.0));
    const open = currentOpen.current;

    // Selective X-Ray for Head Shell and Visor (Prompt Section 8 & 29)
    const isHeadActive = activeRegion === 'head' || isBrainFocused;
    const targetHeadOpacity = isHeadActive ? 0.42 : 0.98;
    const targetVisorTransmission = isHeadActive ? 0.65 : 0.20;

    if (headShellMatRef.current) {
      headShellMatRef.current.opacity = THREE.MathUtils.lerp(headShellMatRef.current.opacity, targetHeadOpacity, delta * 4.0);
    }
    if (visorGlassMatRef.current) {
      visorGlassMatRef.current.transmission = THREE.MathUtils.lerp(visorGlassMatRef.current.transmission, targetVisorTransmission, delta * 4.0);
    }

    // Subtle pointer head tracking when not focused
    if (headGroupRef.current && !isBrainFocused) {
      const targetRotY = THREE.MathUtils.clamp((pointerPos.x || 0) * 0.12, -0.12, 0.12);
      const targetRotX = THREE.MathUtils.clamp(-(pointerPos.y || 0) * 0.06, -0.06, 0.06);
      headGroupRef.current.rotation.y = THREE.MathUtils.lerp(headGroupRef.current.rotation.y, targetRotY, delta * 3.0);
      headGroupRef.current.rotation.x = THREE.MathUtils.lerp(headGroupRef.current.rotation.x, targetRotX, delta * 3.0);
    }

    // ==============================================================
    // ASSEMBLED INTEGRITY: The head remains completely whole & intact
    // NO mechanical skull lifting, NO cat ears / horns!
    // Intelligence operates internally through light and transparency
    // ==============================================================
    if (crownPanelRef.current) {
      crownPanelRef.current.position.y = 0.44; // Flush at top
    }

    if (leftCranialShellRef.current) {
      leftCranialShellRef.current.position.x = -0.58; // Flush
    }

    if (rightCranialShellRef.current) {
      rightCranialShellRef.current.position.x = 0.58; // Flush
    }

    // Internal electronics bay positioned at optimal line-of-sight behind visor
    if (internalBayRef.current) {
      internalBayRef.current.position.y = 0.26;
      internalBayRef.current.position.z = 0.08;
    }

    // ==============================================================
    // VISOR LIFE: Calm eye blinks & micro gaze tracking
    // ==============================================================
    blinkTimer.current += delta;
    if (blinkTimer.current > 4.5) {
      isBlinking.current = true;
      if (blinkTimer.current > 4.66) {
        isBlinking.current = false;
        blinkTimer.current = 0;
      }
    }

    const eyeScaleY = isBlinking.current ? 0.12 : 1.0;
    if (leftEyeRef.current) {
      leftEyeRef.current.scale.y = THREE.MathUtils.lerp(leftEyeRef.current.scale.y, eyeScaleY, delta * 20);
    }
    if (rightEyeRef.current) {
      rightEyeRef.current.scale.y = THREE.MathUtils.lerp(rightEyeRef.current.scale.y, eyeScaleY, delta * 20);
    }

    if (gazeGroupRef.current) {
      gazeGroupRef.current.position.x = Math.sin(t * 0.6) * 0.012;
      gazeGroupRef.current.position.y = Math.cos(t * 0.4) * 0.006;
    }

    // ==============================================================
    // INTERNAL RETRIEVAL ANIMATION (ACTION BEFORE LABEL)
    // Runs internally when brain intelligence is active
    // ==============================================================
    if (isBrainFocused) {
      // 1. Query Node pulse
      if (queryNodeRef.current) {
        const pulse = 1.0 + Math.sin(t * 4.0) * 0.10;
        queryNodeRef.current.scale.set(pulse, pulse, pulse);
      }

      // 2. Qdrant Dense Vector Cluster
      if (qdrantClusterRef.current) {
        qdrantClusterRef.current.rotation.y += delta * 0.5;
        qdrantClusterRef.current.rotation.x = Math.sin(t * 1.5) * 0.1;
      }

      // 3. Tantivy Lexical Bands
      if (tantivyBandsRef.current) {
        tantivyBandsRef.current.children.forEach((child, i) => {
          child.position.y = 0.008 * Math.sin(t * 3.0 + i * 0.9);
        });
      }

      // 4. NetworkX Relational Graph
      if (networkxGraphRef.current) {
        networkxGraphRef.current.rotation.y += delta * 0.6;
      }

      // 5. Query packet physical split & return cycle
      const streamT = (t * 0.8) % 1.0;
      if (packetDenseRef.current) {
        if (streamT < 0.5) {
          const p = streamT / 0.5;
          packetDenseRef.current.position.set(
            THREE.MathUtils.lerp(0, -0.16, p),
            0.08,
            THREE.MathUtils.lerp(0.12, 0.0, p)
          );
        } else {
          const p = (streamT - 0.5) / 0.5;
          packetDenseRef.current.position.set(
            THREE.MathUtils.lerp(-0.16, 0, p),
            0.08,
            THREE.MathUtils.lerp(0.0, -0.06, p)
          );
        }
      }

      if (packetLexicalRef.current) {
        if (streamT < 0.5) {
          const p = streamT / 0.5;
          packetLexicalRef.current.position.set(
            0,
            THREE.MathUtils.lerp(0.08, 0.12, p),
            THREE.MathUtils.lerp(0.12, -0.12, p)
          );
        } else {
          const p = (streamT - 0.5) / 0.5;
          packetLexicalRef.current.position.set(
            0,
            THREE.MathUtils.lerp(0.12, 0.08, p),
            THREE.MathUtils.lerp(-0.12, -0.06, p)
          );
        }
      }

      if (packetGraphRef.current) {
        if (streamT < 0.5) {
          const p = streamT / 0.5;
          packetGraphRef.current.position.set(
            THREE.MathUtils.lerp(0, 0.16, p),
            0.08,
            THREE.MathUtils.lerp(0.12, 0.0, p)
          );
        } else {
          const p = (streamT - 0.5) / 0.5;
          packetGraphRef.current.position.set(
            THREE.MathUtils.lerp(0.16, 0, p),
            0.08,
            THREE.MathUtils.lerp(0.0, -0.06, p)
          );
        }
      }

      // 6. RRF Fusion convergence motion
      if (rrfConvergenceRef.current) {
        rrfConvergenceRef.current.rotation.y += delta * 1.2;
      }

      // 7. FlashRank Gate: Top candidates advance forward, lower fade
      if (flashrankGateRef.current) {
        flashrankGateRef.current.children.forEach((child, i) => {
          if (i < 2) {
            child.position.z = -0.04 + Math.sin(t * 2.0) * 0.025;
          } else {
            child.position.x = (i % 2 === 0 ? 0.09 : -0.09) + Math.sin(t * 1.0) * 0.01;
          }
        });
      }

      // 8. Gemini Grounded Inference Core
      if (geminiCrystalRef.current) {
        geminiCrystalRef.current.rotation.y += delta * 0.9;
        geminiCrystalRef.current.rotation.x += delta * 0.4;
        const crystalScale = 1.0 + Math.sin(t * 3.5) * 0.08;
        geminiCrystalRef.current.scale.set(crystalScale, crystalScale, crystalScale);
      }

      // 9. Draft answer begins descending down neck collar
      if (draftEgressRef.current) {
        if (showGenerationCore) {
          draftEgressRef.current.visible = true;
          const egressP = (t * 0.6) % 1.0;
          draftEgressRef.current.position.y = THREE.MathUtils.lerp(0.08, -0.22, egressP);
          draftEgressRef.current.position.z = THREE.MathUtils.lerp(0.05, 0.20, egressP);
        } else {
          draftEgressRef.current.visible = false;
        }
      }
    }
  });

  return (
    <group ref={headGroupRef} position={[0, 0.95, 0]}>
      {/* ============================================================== */}
      {/* 1. INTERNAL RETRIEVAL / INTELLIGENCE CHAMBER                   */}
      {/* ============================================================== */}
      <group ref={internalBayRef} position={[0, 0.32, 0]} visible={isBrainFocused}>
        {/* Recessed Mounting Bed */}
        <mesh position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.30, 0.34, 0.04, 32]} />
          <meshStandardMaterial
            color={PALETTE.jointGraphite}
            metalness={0.75}
            roughness={0.3}
          />
        </mesh>
        {/* Precision Sliding Guide Rails */}
        {[-0.14, 0.14].map((x, i) => (
          <mesh key={`rail-${i}`} position={[x, 0.01, 0]}>
            <boxGeometry args={[0.016, 0.010, 0.32]} />
            <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.88} roughness={0.18} />
          </mesh>
        ))}

        {/* --- FRONT: Query Node (Intake Gateway) --- */}
        <group position={[0, 0.08, 0.12]}>
          <mesh ref={queryNodeRef}>
            <octahedronGeometry args={[0.032, 0]} />
            <meshStandardMaterial
              color={PALETTE.cyanGlow}
              emissive={PALETTE.cyanGlow}
              emissiveIntensity={2.2}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.038, 0.046, 24]} />
            <meshBasicMaterial color={PALETTE.cyanSignal} />
          </mesh>
        </group>

        {/* --- LEFT: Dense / Qdrant Vector Cluster --- */}
        <group position={[-0.16, 0.08, 0.0]}>
          <group ref={qdrantClusterRef}>
            {[-0.025, 0, 0.025].map((x, xi) =>
              [-0.02, 0.02].map((y, yi) =>
                [-0.02, 0.02].map((z, zi) => (
                  <mesh key={`qd-pt-${xi}-${yi}-${zi}`} position={[x, y, z]}>
                    <sphereGeometry args={[0.007, 6, 6]} />
                    <meshBasicMaterial color={PALETTE.cyanGlow} />
                  </mesh>
                ))
              )
            )}
          </group>
          <mesh position={[0.08, 0, 0.06]} rotation={[0, -0.6, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.16, 6]} />
            <meshBasicMaterial color={PALETTE.cyanSoft} transparent opacity={0.6} />
          </mesh>
        </group>

        {/* --- CENTER-BACK: Lexical / Tantivy BM25 Token Bands --- */}
        <group position={[0, 0.10, -0.12]}>
          <group ref={tantivyBandsRef}>
            {[-0.032, -0.010, 0.010, 0.032].map((x, idx) => (
              <mesh key={`tk-band-${idx}`} position={[x, 0, 0]}>
                <boxGeometry args={[0.010, 0.060, 0.010]} />
                <meshStandardMaterial
                  color={PALETTE.cyanSoft}
                  emissive={PALETTE.cyanSoft}
                  emissiveIntensity={1.4}
                />
              </mesh>
            ))}
          </group>
          <mesh position={[0, -0.01, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.22, 6]} />
            <meshBasicMaterial color={PALETTE.cyanSoft} transparent opacity={0.6} />
          </mesh>
        </group>

        {/* --- RIGHT: Graph / NetworkX Relational Structure --- */}
        <group position={[0.16, 0.08, 0.0]}>
          <group ref={networkxGraphRef}>
            {[
              [-0.025, 0.022, 0],
              [0.025, 0.022, 0],
              [0, -0.025, 0],
            ].map(([gx, gy, gz], idx) => (
              <mesh key={`nx-pt-${idx}`} position={[gx, gy, gz]}>
                <sphereGeometry args={[0.009, 8, 8]} />
                <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={1.8} />
              </mesh>
            ))}
            <mesh position={[0, 0.022, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.050, 6]} />
              <meshBasicMaterial color="#a78bfa" />
            </mesh>
            <mesh position={[-0.012, -0.002, 0]} rotation={[0, 0, 0.55]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.055, 6]} />
              <meshBasicMaterial color="#a78bfa" />
            </mesh>
            <mesh position={[0.012, -0.002, 0]} rotation={[0, 0, -0.55]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.055, 6]} />
              <meshBasicMaterial color="#a78bfa" />
            </mesh>
          </group>
          <mesh position={[-0.08, 0, 0.06]} rotation={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.16, 6]} />
            <meshBasicMaterial color="#a78bfa" transparent opacity={0.6} />
          </mesh>
        </group>

        {/* Traveling candidate streams */}
        <mesh ref={packetDenseRef} position={[-0.08, 0.08, 0.06]}>
          <sphereGeometry args={[0.011, 8, 8]} />
          <meshStandardMaterial color={PALETTE.whiteHot} emissive={PALETTE.cyanGlow} emissiveIntensity={2.5} />
        </mesh>
        <mesh ref={packetLexicalRef} position={[0, 0.09, 0.0]}>
          <sphereGeometry args={[0.011, 8, 8]} />
          <meshStandardMaterial color={PALETTE.whiteHot} emissive={PALETTE.cyanSoft} emissiveIntensity={2.5} />
        </mesh>
        <mesh ref={packetGraphRef} position={[0.08, 0.08, 0.06]}>
          <sphereGeometry args={[0.011, 8, 8]} />
          <meshStandardMaterial color={PALETTE.whiteHot} emissive="#8b5cf6" emissiveIntensity={2.5} />
        </mesh>

        {/* RRF Convergence Zone */}
        <group ref={rrfConvergenceRef} position={[0, 0.08, -0.05]}>
          <mesh rotation={[Math.PI / 4, 0, 0]}>
            <torusGeometry args={[0.12, 0.004, 12, 36]} />
            <meshStandardMaterial
              color={PALETTE.cyanGlow}
              emissive={PALETTE.cyanGlow}
              emissiveIntensity={showRerankLattice ? 2.4 : 1.2}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 4, 0, 0]}>
            <torusGeometry args={[0.09, 0.003, 12, 36]} />
            <meshStandardMaterial
              color={PALETTE.cyanSignal}
              emissive={PALETTE.cyanSignal}
              emissiveIntensity={showRerankLattice ? 2.0 : 0.9}
            />
          </mesh>
        </group>

        {/* FlashRank Gate */}
        <group position={[0, 0.08, -0.05]}>
          <mesh position={[0, 0, 0.025]}>
            <boxGeometry args={[0.14, 0.004, 0.006]} />
            <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.9} roughness={0.2} />
          </mesh>
          <group ref={flashrankGateRef}>
            <mesh position={[-0.025, 0.01, 0.0]}>
              <boxGeometry args={[0.024, 0.005, 0.034]} />
              <meshStandardMaterial
                color={PALETTE.whiteHot}
                emissive={PALETTE.cyanGlow}
                emissiveIntensity={showRerankLattice ? 2.6 : 1.2}
              />
            </mesh>
            <mesh position={[0.025, 0.01, 0.0]}>
              <boxGeometry args={[0.024, 0.005, 0.034]} />
              <meshStandardMaterial
                color={PALETTE.whiteHot}
                emissive={PALETTE.cyanGlow}
                emissiveIntensity={showRerankLattice ? 2.6 : 1.2}
              />
            </mesh>
            <mesh position={[-0.06, 0.01, 0.012]}>
              <boxGeometry args={[0.018, 0.004, 0.024]} />
              <meshBasicMaterial color={PALETTE.textMuted} transparent opacity={0.35} />
            </mesh>
            <mesh position={[0.06, 0.01, 0.012]}>
              <boxGeometry args={[0.018, 0.004, 0.024]} />
              <meshBasicMaterial color={PALETTE.textMuted} transparent opacity={0.35} />
            </mesh>
          </group>
        </group>

        {/* Gemini Grounded Inference Core */}
        <group position={[0, 0.14, -0.05]}>
          <mesh ref={geminiCrystalRef}>
            <octahedronGeometry args={[0.055, 0]} />
            <meshPhysicalMaterial
              color={PALETTE.cyanGlow}
              emissive={PALETTE.cyanGlow}
              emissiveIntensity={showGenerationCore ? 2.8 : 1.5}
              roughness={0.1}
              metalness={0.15}
              transmission={0.65}
              thickness={0.4}
              transparent
              opacity={0.95}
            />
          </mesh>
        </group>

        {/* Draft Answer Egress */}
        <mesh ref={draftEgressRef} visible={false}>
          <sphereGeometry args={[0.020, 16, 16]} />
          <meshStandardMaterial
            color={PALETTE.whiteHot}
            emissive={PALETTE.cyanGlow}
            emissiveIntensity={2.8}
          />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 2. BASE SCULPTED HEAD SHELL (Single unified squircle dome)     */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 2. BASE SCULPTED HEAD SHELL (Single unified squircle dome)     */}
      {/* ============================================================== */}
      <group position={[0, -0.02, 0]}>
        <RoundedBox args={[1.28, 0.88, 0.86]} radius={0.32} smoothness={10}>
          <meshPhysicalMaterial
            ref={headShellMatRef}
            color={PALETTE.pearlWhite}
            roughness={0.22}
            metalness={0.08}
            clearcoat={0.6}
            clearcoatRoughness={0.2}
            transparent
            opacity={0.98}
            depthWrite
          />
        </RoundedBox>
      </group>

      {/* Floating Canonical Source Excerpt Object (Prompt Section 37) */}
      {(showGenerationCore || showRerankLattice) && (
        <group position={[0, 0.12, 0.58]}>
          <mesh>
            <boxGeometry args={[0.34, 0.20, 0.008]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.05} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.344, 0.204, 0.006]} />
            <meshBasicMaterial color={PALETTE.cyanGlow} wireframe />
          </mesh>
          {/* Header Bar */}
          <mesh position={[0, 0.07, 0.005]}>
            <boxGeometry args={[0.30, 0.022, 0.002]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          {/* Highlighted Evidence Row 1: Rated Flow 120 m³/h */}
          <mesh position={[0, 0.025, 0.005]}>
            <boxGeometry args={[0.28, 0.020, 0.002]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
          {/* Highlighted Evidence Row 2: Max Discharge Pressure 12.5 bar */}
          <mesh position={[0, -0.012, 0.005]}>
            <boxGeometry args={[0.28, 0.020, 0.002]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
          {/* Subtle text row placeholder */}
          <mesh position={[-0.04, -0.048, 0.005]}>
            <boxGeometry args={[0.20, 0.010, 0.002]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
          {/* Citation Pip */}
          <mesh position={[0.10, -0.048, 0.005]}>
            <boxGeometry args={[0.06, 0.010, 0.002]} />
            <meshBasicMaterial color={PALETTE.greenGlow} />
          </mesh>
        </group>
      )}

      {/* ============================================================== */}
      {/* 3. FLUSH TOP CRANIAL SERVICE PANEL (Precision Option A Lift)   */}
      {/* Perfectly flush when closed; rises strictly vertically 0.065m */}
      {/* ============================================================== */}
      <group ref={crownPanelRef} position={[0, 0.44, 0]}>
        {/* Low-profile circular crown plate */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.36, 0.025, 32]} />
          <meshPhysicalMaterial
            color={PALETTE.pearlWhite}
            roughness={0.22}
            metalness={0.08}
            clearcoat={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Underside precision guide flange */}
        <mesh position={[0, -0.013, 0]}>
          <cylinderGeometry args={[0.30, 0.32, 0.008, 32]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Satin silver service rim & optical port */}
        <mesh position={[0, 0.013, 0]}>
          <ringGeometry args={[0.18, 0.32, 32]} />
          <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.014, 0]}>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color={PALETTE.cyanGlow} transparent opacity={0.7} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 4. SEAMLESS SMOKED VISOR SCREEN & CALM SENSOR GRAPHICS         */}
      {/* ============================================================== */}
      <group position={[0, 0.02, 0.43]} rotation={[-0.03, 0, 0]}>
        <RoundedBox args={[1.11, 0.71, 0.10]} radius={0.23} smoothness={8}>
          <meshStandardMaterial
            color={PALETTE.satinSilver}
            metalness={0.85}
            roughness={0.22}
          />
        </RoundedBox>

        <RoundedBox args={[1.07, 0.67, 0.12]} radius={0.21} smoothness={8} position={[0, 0, 0.008]}>
          <meshPhysicalMaterial
            ref={visorGlassMatRef}
            color={PALETTE.visorGlass}
            roughness={0.04}
            metalness={0.10}
            clearcoat={1.0}
            clearcoatRoughness={0.03}
            transmission={0.20}
            transparent
            opacity={0.98}
          />
        </RoundedBox>

        <group ref={gazeGroupRef} position={[0, 0, 0.070]}>
          <group position={[-0.26, 0.03, 0]}>
            <mesh ref={leftEyeRef} rotation={[0, 0, Math.PI / 2 + 0.04]}>
              <capsuleGeometry args={[0.025, 0.088, 16, 24]} />
              <meshStandardMaterial
                color={PALETTE.cyanGlow}
                emissive={PALETTE.cyanGlow}
                emissiveIntensity={2.4}
                roughness={0.1}
              />
            </mesh>
            <mesh position={[0, 0, 0.004]}>
              <sphereGeometry args={[0.012, 12, 12]} />
              <meshBasicMaterial color={PALETTE.whiteHot} />
            </mesh>
          </group>

          <group position={[0.26, 0.03, 0]}>
            <mesh ref={rightEyeRef} rotation={[0, 0, Math.PI / 2 - 0.04]}>
              <capsuleGeometry args={[0.025, 0.088, 16, 24]} />
              <meshStandardMaterial
                color={PALETTE.cyanGlow}
                emissive={PALETTE.cyanGlow}
                emissiveIntensity={2.4}
                roughness={0.1}
              />
            </mesh>
            <mesh position={[0, 0, 0.004]}>
              <sphereGeometry args={[0.012, 12, 12]} />
              <meshBasicMaterial color={PALETTE.whiteHot} />
            </mesh>
          </group>

          <mesh position={[0, -0.14, 0]}>
            <boxGeometry args={[0.16, 0.006, 0.002]} />
            <meshStandardMaterial
              color={PALETTE.cyanGlow}
              emissive={PALETTE.cyanGlow}
              emissiveIntensity={1.2}
            />
          </mesh>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 5. REAR EXHAUST & COOLING LOUVERS                              */}
      {/* ============================================================== */}
      <group position={[0, 0.04, -0.44]}>
        {[-0.12, -0.04, 0.04, 0.12].map((y, idx) => (
          <mesh key={`head-louver-${idx}`} position={[0, y, 0]}>
            <boxGeometry args={[0.42, 0.028, 0.016]} />
            <meshStandardMaterial
              color={PALETTE.jointGraphite}
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
