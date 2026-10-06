'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './Materials';

interface ArtifactVisualsProps {
  showIngestionDoc?: boolean;
  showQueryPacket?: boolean;
  showClaimCards?: boolean;
  showRecoveryBranch?: boolean;
  showReverification?: boolean;
  showOutputAssembly?: boolean;
  showVerifiedBadge?: boolean;
  trustCoreState?: 'idle' | 'evaluating' | 'verified' | 'contradiction' | 'recovery';
  demoConflict?: boolean;
}

export const ArtifactVisuals: React.FC<ArtifactVisualsProps> = ({
  showIngestionDoc = false,
  showQueryPacket = false,
  showClaimCards = false,
  showRecoveryBranch = false,
  showReverification = false,
  showOutputAssembly = false,
  showVerifiedBadge = false,
  trustCoreState = 'idle',
  demoConflict = true,
}) => {
  // Ingestion refs
  const ingestionGroupRef = useRef<THREE.Group>(null);
  const docPage1Ref = useRef<THREE.Group>(null);
  const docPage2Ref = useRef<THREE.Group>(null);
  const docPage3Ref = useRef<THREE.Group>(null);
  const chunkClusterRef = useRef<THREE.Group>(null);

  // Query Packet ref
  const queryGroupRef = useRef<THREE.Group>(null);

  // Claim Descent & Recovery refs
  const claim1Ref = useRef<THREE.Group>(null);
  const claim2Ref = useRef<THREE.Group>(null);
  const conflictCompareRef = useRef<THREE.Group>(null);

  // Output Formation refs
  const outputCardRef = useRef<THREE.Group>(null);
  const outputParticlesRef = useRef<THREE.Points>(null);
  const sealRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // ==============================================================
    // 1. PHYSICAL PDF APPROACH & TRANSFORMATION (GATE A)
    // Left palm intake is at [-0.72, -0.25, 0.18]
    // ==============================================================
    if (showIngestionDoc && ingestionGroupRef.current) {
      const cycle = (t * 0.28) % 1.0;

      if (cycle < 0.28) {
        // Stage 1: Approaches from outside [-1.25, 0.18, 0.32] to dock above palm [-0.72, -0.16, 0.20]
        const p = cycle / 0.28;
        const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
        ingestionGroupRef.current.position.set(
          THREE.MathUtils.lerp(-1.25, -0.72, smoothP),
          THREE.MathUtils.lerp(0.18, -0.16, smoothP),
          THREE.MathUtils.lerp(0.32, 0.20, smoothP)
        );
        ingestionGroupRef.current.rotation.set(0.1, THREE.MathUtils.lerp(0.4, 0.08, smoothP), -0.05);

        if (docPage1Ref.current) docPage1Ref.current.position.set(0, 0, 0);
        if (docPage2Ref.current) docPage2Ref.current.position.set(0, 0, -0.008);
        if (docPage3Ref.current) docPage3Ref.current.position.set(0, 0, -0.016);
        if (chunkClusterRef.current) chunkClusterRef.current.visible = false;
      } else if (cycle < 0.62) {
        // Stage 2: Docked at palm -> Separates into 3 layered pages
        const p = (cycle - 0.28) / 0.34;
        ingestionGroupRef.current.position.set(-0.72, -0.16, 0.20);

        if (docPage1Ref.current) {
          docPage1Ref.current.position.set(0, 0, p * 0.035);
        }
        if (docPage2Ref.current) {
          docPage2Ref.current.position.set(-p * 0.04, -p * 0.03, 0);
        }
        if (docPage3Ref.current) {
          docPage3Ref.current.position.set(p * 0.04, -p * 0.04, -0.02);
        }
        if (chunkClusterRef.current) chunkClusterRef.current.visible = false;
      } else {
        // Stage 3: Pages compress and split into 4 distinct chunk packets that enter palm conduit
        const p = (cycle - 0.62) / 0.38;
        ingestionGroupRef.current.position.set(-0.72, -0.16, 0.20);

        if (chunkClusterRef.current) {
          chunkClusterRef.current.visible = true;
          // Chunks compress directly toward intake aperture [-0.72, -0.25, 0.18]
          chunkClusterRef.current.position.set(
            0,
            THREE.MathUtils.lerp(0, -0.09, p),
            THREE.MathUtils.lerp(0, -0.02, p)
          );
          const s = Math.max(0.01, 1.0 - p * 0.85);
          chunkClusterRef.current.scale.set(s, s, s);
        }
        if (docPage1Ref.current) docPage1Ref.current.position.y = -p * 0.06;
      }
    }

    // ==============================================================
    // 2. QUERY SPEECH/DATA PACKET (GATE B INTAKE)
    // ==============================================================
    if (showQueryPacket && queryGroupRef.current) {
      const qCycle = (t * 0.45) % 1.0;
      queryGroupRef.current.position.set(
        THREE.MathUtils.lerp(-1.05, -0.72, qCycle),
        THREE.MathUtils.lerp(0.15, -0.22, qCycle),
        THREE.MathUtils.lerp(0.26, 0.18, qCycle)
      );
      queryGroupRef.current.rotation.y += delta * 1.5;
    }

    // ==============================================================
    // 3. CLAIM EXTRACTION & DESCENT (HEAD -> CHEST) (GATE C)
    // ==============================================================
    if (showClaimCards) {
      // Claim 01: Rated Flow 120 m³/h (Descends to Trust Core and Passes -> Green)
      if (claim1Ref.current) {
        if (trustCoreState === 'evaluating') {
          claim1Ref.current.position.set(-0.24, 0.34 + Math.sin(t * 2.0) * 0.015, 0.44);
        } else {
          claim1Ref.current.position.set(-0.22, 0.20, 0.46);
        }
      }

      // Claim 02: 15.2 bar -> Conflict -> Physical Recovery Loop (GATE D)
      if (claim2Ref.current) {
        if (trustCoreState === 'evaluating') {
          claim2Ref.current.position.set(0.24, 0.34 + Math.sin(t * 2.0 + 1) * 0.015, 0.44);
        } else if (trustCoreState === 'contradiction') {
          claim2Ref.current.position.set(0.22, 0.18, 0.46);
        } else if (trustCoreState === 'recovery' || showRecoveryBranch) {
          // Physical continuous motion loop:
          // Trust Core [0.22, 0.18, 0.46] -> Spine Bus [0, 0.35, -0.35] -> Head [0, 0.95, -0.05] -> Back down to Core!
          const loopT = (t * 0.35) % 1.0;
          if (loopT < 0.4) {
            // Ascending up spine to head
            const p = loopT / 0.4;
            claim2Ref.current.position.set(
              THREE.MathUtils.lerp(0.22, 0, p),
              THREE.MathUtils.lerp(0.18, 0.95, p),
              THREE.MathUtils.lerp(0.46, -0.05, p)
            );
          } else if (loopT < 0.6) {
            // In head: targeted retrieval retrieves 12.5 bar, transforms to amber
            claim2Ref.current.position.set(0, 0.95, -0.05);
          } else {
            // Descending back down spine to Trust Core
            const p = (loopT - 0.6) / 0.4;
            claim2Ref.current.position.set(
              THREE.MathUtils.lerp(0, 0.22, p),
              THREE.MathUtils.lerp(0.95, 0.20, p),
              THREE.MathUtils.lerp(-0.05, 0.46, p)
            );
          }
        } else if (showReverification || showOutputAssembly) {
          claim2Ref.current.position.set(0.22, 0.20, 0.46);
        }
      }

      // Local conflict indicator: 15.2 ≠ 12.5 appears inside Trust Core
      if (conflictCompareRef.current) {
        if (trustCoreState === 'contradiction' && demoConflict) {
          conflictCompareRef.current.visible = true;
          const pulse = 1.0 + Math.sin(t * 5.0) * 0.08;
          conflictCompareRef.current.scale.set(pulse, pulse, pulse);
        } else {
          conflictCompareRef.current.visible = false;
        }
      }
    }

    // ==============================================================
    // 4. RIGHT-HAND PHYSICAL OUTPUT MATERIALIZATION (GATE E)
    // Right palm is at [0.72, -0.25, 0.18]
    // ==============================================================
    if (showOutputAssembly && outputCardRef.current) {
      const outCycle = (t * 0.32) % 1.0;

      // Positioned directly above presenting right palm
      outputCardRef.current.position.set(0.72, -0.12 + Math.sin(t * 1.8) * 0.012, 0.20);
      outputCardRef.current.rotation.y = -0.15 + Math.sin(t * 1.2) * 0.04;

      if (outputParticlesRef.current) {
        outputParticlesRef.current.rotation.y += delta * 1.5;
        outputParticlesRef.current.visible = outCycle < 0.65;
      }

      if (sealRef.current) {
        const sealScale = outCycle > 0.45 ? 1.0 : Math.max(0.01, outCycle / 0.45);
        sealRef.current.scale.set(sealScale, sealScale, sealScale);
      }
    }
  });

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. PHYSICAL PDF INGESTION & DECOMPOSITION (GATE A)             */}
      {/* ============================================================== */}
      {showIngestionDoc && (
        <group ref={ingestionGroupRef} position={[-0.72, -0.16, 0.20]}>
          {/* Page 1 (Top Sheet with Title & Schematic) */}
          <group ref={docPage1Ref}>
            <mesh>
              <boxGeometry args={[0.24, 0.30, 0.006]} />
              <meshStandardMaterial color="#ffffff" roughness={0.25} metalness={0.05} />
            </mesh>
            {/* Header Badge: "P-101A" */}
            <mesh position={[-0.05, 0.12, 0.004]}>
              <boxGeometry args={[0.07, 0.020, 0.002]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
            {/* Document Header "CENTRIFUGAL PUMP" */}
            <mesh position={[0.035, 0.12, 0.004]}>
              <boxGeometry args={[0.09, 0.012, 0.002]} />
              <meshBasicMaterial color="#475569" />
            </mesh>
            {/* Technical Pump Drawing Outline */}
            <group position={[0, 0.05, 0.004]}>
              <mesh>
                <boxGeometry args={[0.19, 0.075, 0.002]} />
                <meshBasicMaterial color="#f8fafc" />
              </mesh>
              {/* Concentric Impeller Ring */}
              <mesh rotation={[0, 0, 0]}>
                <ringGeometry args={[0.016, 0.020, 24]} />
                <meshBasicMaterial color="#94a3b8" />
              </mesh>
              {/* Suction Nozzle */}
              <mesh position={[-0.045, 0, 0]}>
                <boxGeometry args={[0.035, 0.010, 0.001]} />
                <meshBasicMaterial color="#94a3b8" />
              </mesh>
              {/* Discharge Nozzle */}
              <mesh position={[0, 0.028, 0]}>
                <boxGeometry args={[0.010, 0.020, 0.001]} />
                <meshBasicMaterial color="#94a3b8" />
              </mesh>
            </group>
            {/* Structured Table Rows */}
            {/* Row 1: Rated Flow 120 m³/h (Cyan Highlight) */}
            <group position={[0, -0.015, 0.004]}>
              <mesh>
                <boxGeometry args={[0.19, 0.016, 0.002]} />
                <meshBasicMaterial color="#e0f2fe" />
              </mesh>
              <mesh position={[-0.03, 0, 0.001]}>
                <boxGeometry args={[0.11, 0.008, 0.001]} />
                <meshBasicMaterial color="#0369a1" />
              </mesh>
              <mesh position={[0.06, 0, 0.001]}>
                <boxGeometry args={[0.045, 0.008, 0.001]} />
                <meshBasicMaterial color={PALETTE.cyanGlow} />
              </mesh>
            </group>
            {/* Row 2: Max Discharge Pressure 12.5 bar (Cyan Highlight) */}
            <group position={[0, -0.040, 0.004]}>
              <mesh>
                <boxGeometry args={[0.19, 0.016, 0.002]} />
                <meshBasicMaterial color="#e0f2fe" />
              </mesh>
              <mesh position={[-0.03, 0, 0.001]}>
                <boxGeometry args={[0.11, 0.008, 0.001]} />
                <meshBasicMaterial color="#0369a1" />
              </mesh>
              <mesh position={[0.06, 0, 0.001]}>
                <boxGeometry args={[0.045, 0.008, 0.001]} />
                <meshBasicMaterial color={PALETTE.cyanGlow} />
              </mesh>
            </group>
            {/* Row 3 & 4: General Specification Rows */}
            {[-0.065, -0.090, -0.115].map((y, i) => (
              <mesh key={`tbl-row-${i}`} position={[0, y, 0.004]}>
                <boxGeometry args={[0.19, 0.010, 0.002]} />
                <meshBasicMaterial color="#cbd5e1" />
              </mesh>
            ))}
          </group>

          {/* Page 2 (Separated Second Sheet) */}
          <group ref={docPage2Ref} position={[-0.015, -0.015, -0.008]}>
            <mesh>
              <boxGeometry args={[0.24, 0.30, 0.005]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.05} />
            </mesh>
            {[-0.03, 0.02, 0.07].map((y, i) => (
              <mesh key={`p2-row-${i}`} position={[0, y, 0.003]}>
                <boxGeometry args={[0.18, 0.014, 0.002]} />
                <meshBasicMaterial color="#cbd5e1" />
              </mesh>
            ))}
          </group>

          {/* Page 3 (Separated Third Sheet) */}
          <group ref={docPage3Ref} position={[0.015, -0.025, -0.016]}>
            <mesh>
              <boxGeometry args={[0.24, 0.30, 0.005]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
            </mesh>
          </group>

          {/* Structured Chunk Packets (Compress into palm aperture) */}
          <group ref={chunkClusterRef} visible={false}>
            {[-0.04, 0.04].map((cx, cxi) =>
              [-0.03, 0.03].map((cy, cyi) => (
                <group key={`chunk-pkt-${cxi}-${cyi}`} position={[cx, cy, 0]}>
                  <mesh>
                    <boxGeometry args={[0.036, 0.026, 0.018]} />
                    <meshStandardMaterial
                      color={PALETTE.whiteHot}
                      emissive={PALETTE.cyanGlow}
                      emissiveIntensity={1.8}
                    />
                  </mesh>
                  {/* Tag Pip [P-101A] */}
                  <mesh position={[0, 0, 0.010]}>
                    <boxGeometry args={[0.020, 0.006, 0.002]} />
                    <meshBasicMaterial color={PALETTE.cyanSignal} />
                  </mesh>
                </group>
              ))
            )}
          </group>
        </group>
      )}

      {/* ============================================================== */}
      {/* 2. COMPACT QUERY CARD / SPEECH-DATA PACKET                     */}
      {/* ============================================================== */}
      {showQueryPacket && (
        <group ref={queryGroupRef} position={[-0.72, -0.16, 0.20]}>
          <mesh>
            <boxGeometry args={[0.20, 0.08, 0.01]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.5} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.204, 0.084, 0.008]} />
            <meshBasicMaterial color={PALETTE.cyanGlow} wireframe />
          </mesh>
          <mesh position={[-0.065, 0.012, 0.006]}>
            <sphereGeometry args={[0.010, 12, 12]} />
            <meshStandardMaterial color={PALETTE.whiteHot} emissive={PALETTE.cyanGlow} emissiveIntensity={2.0} />
          </mesh>
          <mesh position={[0.02, 0.015, 0.006]}>
            <boxGeometry args={[0.10, 0.010, 0.002]} />
            <meshBasicMaterial color={PALETTE.whiteHot} />
          </mesh>
          <mesh position={[0.0, -0.015, 0.006]}>
            <boxGeometry args={[0.14, 0.008, 0.002]} />
            <meshBasicMaterial color={PALETTE.cyanSoft} />
          </mesh>
        </group>
      )}

      {/* ============================================================== */}
      {/* 3. ATOMIC CLAIM 01: [120 m³/h] (Passes -> GREEN)               */}
      {/* ============================================================== */}
      {showClaimCards && (
        <group ref={claim1Ref} position={[-0.22, 0.20, 0.46]}>
          <mesh>
            <boxGeometry args={[0.24, 0.08, 0.012]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.4} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.244, 0.084, 0.01]} />
            <meshBasicMaterial
              color={trustCoreState === 'verified' || showOutputAssembly ? PALETTE.greenGlow : PALETTE.cyanGlow}
              wireframe
            />
          </mesh>
          <mesh position={[-0.105, 0, 0.008]}>
            <boxGeometry args={[0.010, 0.06, 0.004]} />
            <meshBasicMaterial
              color={trustCoreState === 'verified' || showOutputAssembly ? PALETTE.greenGlow : PALETTE.cyanGlow}
            />
          </mesh>
          <mesh position={[0.012, 0.015, 0.008]}>
            <boxGeometry args={[0.15, 0.012, 0.002]} />
            <meshBasicMaterial color={PALETTE.whiteHot} />
          </mesh>
          <mesh position={[0.01, -0.015, 0.008]}>
            <boxGeometry args={[0.12, 0.008, 0.002]} />
            <meshBasicMaterial
              color={trustCoreState === 'verified' || showOutputAssembly ? PALETTE.greenSoft : PALETTE.cyanSoft}
            />
          </mesh>
        </group>
      )}

      {/* ============================================================== */}
      {/* 4. ATOMIC CLAIM 02: [15.2 bar -> 12.5 bar Conflict & Recovery] */}
      {/* ============================================================== */}
      {showClaimCards && (
        <group ref={claim2Ref} position={[0.22, 0.20, 0.46]}>
          <mesh>
            <boxGeometry args={[0.24, 0.08, 0.012]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.4} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.244, 0.084, 0.01]} />
            <meshBasicMaterial
              color={
                !demoConflict
                  ? PALETTE.greenGlow
                  : trustCoreState === 'contradiction'
                  ? PALETTE.redGlow
                  : trustCoreState === 'recovery' || showRecoveryBranch
                  ? PALETTE.amberGlow
                  : showReverification || showOutputAssembly || trustCoreState === 'verified'
                  ? PALETTE.greenGlow
                  : PALETTE.cyanGlow
              }
              wireframe
            />
          </mesh>
          <mesh position={[-0.105, 0, 0.008]}>
            <boxGeometry args={[0.010, 0.06, 0.004]} />
            <meshBasicMaterial
              color={
                !demoConflict
                  ? PALETTE.greenGlow
                  : trustCoreState === 'contradiction'
                  ? PALETTE.redGlow
                  : trustCoreState === 'recovery' || showRecoveryBranch
                  ? PALETTE.amberGlow
                  : showReverification || showOutputAssembly || trustCoreState === 'verified'
                  ? PALETTE.greenGlow
                  : PALETTE.cyanGlow
              }
            />
          </mesh>
          {/* Claim Text Bar: Red tinted in contradiction, amber in recovery, white when verified */}
          <mesh position={[0.012, 0.015, 0.008]}>
            <boxGeometry args={[0.15, 0.012, 0.002]} />
            <meshBasicMaterial
              color={
                !demoConflict
                  ? PALETTE.whiteHot
                  : trustCoreState === 'contradiction'
                  ? '#fca5a5'
                  : trustCoreState === 'recovery'
                  ? '#fef08a'
                  : PALETTE.whiteHot
              }
            />
          </mesh>
          {/* Status Subtitle: 15.2 bar (red) -> morphs to 12.5 bar (amber) -> verified 12.5 bar (green) */}
          <mesh position={[0.01, -0.015, 0.008]}>
            <boxGeometry args={[0.12, 0.008, 0.002]} />
            <meshBasicMaterial
              color={
                !demoConflict
                  ? PALETTE.greenSoft
                  : trustCoreState === 'contradiction'
                  ? PALETTE.redGlow
                  : trustCoreState === 'recovery' || showRecoveryBranch
                  ? PALETTE.amberGlow
                  : showReverification || showOutputAssembly || trustCoreState === 'verified'
                  ? PALETTE.greenSoft
                  : PALETTE.cyanSoft
              }
            />
          </mesh>
        </group>
      )}

      {/* ============================================================== */}
      {/* 5. LOCAL NUMERIC CONFLICT DISPLAY: 15.2 ≠ 12.5                 */}
      {/* ============================================================== */}
      <group ref={conflictCompareRef} position={[0, 0.32, 0.44]} visible={false}>
        <mesh>
          <boxGeometry args={[0.20, 0.045, 0.008]} />
          <meshStandardMaterial color="#450a0a" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.204, 0.049, 0.006]} />
          <meshBasicMaterial color={PALETTE.redGlow} wireframe />
        </mesh>
        <mesh position={[-0.04, 0, 0.006]}>
          <boxGeometry args={[0.035, 0.012, 0.002]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <boxGeometry args={[0.012, 0.012, 0.002]} />
          <meshBasicMaterial color={PALETTE.redGlow} />
        </mesh>
        <mesh position={[0.04, 0, 0.006]}>
          <boxGeometry args={[0.035, 0.012, 0.002]} />
          <meshBasicMaterial color={PALETTE.greenGlow} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 6. VERIFIED ENGINEERING RESPONSE CARD (GATE E)                 */}
      {/* ============================================================== */}
      {showOutputAssembly && (
        <group ref={outputCardRef} position={[0.72, -0.12, 0.20]}>
          <points ref={outputParticlesRef}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <pointsMaterial size={0.007} color={PALETTE.greenGlow} transparent opacity={0.6} />
          </points>

          <mesh>
            <boxGeometry args={[0.26, 0.32, 0.01]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.05} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.264, 0.324, 0.008]} />
            <meshBasicMaterial color={PALETTE.greenGlow} wireframe />
          </mesh>

          <group ref={sealRef} position={[0, 0.115, 0.006]}>
            <mesh position={[-0.07, 0, 0]}>
              <circleGeometry args={[0.014, 20]} />
              <meshBasicMaterial color={PALETTE.greenGlow} />
            </mesh>
            <mesh position={[0.02, 0, 0]}>
              <boxGeometry args={[0.12, 0.014, 0.002]} />
              <meshBasicMaterial color="#0f172a" />
            </mesh>
          </group>

          <mesh position={[0, 0.05, 0.006]}>
            <boxGeometry args={[0.20, 0.016, 0.002]} />
            <meshBasicMaterial color="#334155" />
          </mesh>
          <mesh position={[0.07, 0.05, 0.008]}>
            <boxGeometry args={[0.035, 0.010, 0.002]} />
            <meshBasicMaterial color={PALETTE.greenGlow} />
          </mesh>

          <mesh position={[0, 0.005, 0.006]}>
            <boxGeometry args={[0.20, 0.016, 0.002]} />
            <meshBasicMaterial color="#334155" />
          </mesh>
          <mesh position={[0.07, 0.005, 0.008]}>
            <boxGeometry args={[0.035, 0.010, 0.002]} />
            <meshBasicMaterial color={PALETTE.greenGlow} />
          </mesh>

          <mesh position={[0, -0.06, 0.006]}>
            <boxGeometry args={[0.20, 0.035, 0.002]} />
            <meshBasicMaterial color="#f1f5f9" />
          </mesh>
          <mesh position={[0, -0.105, 0.006]}>
            <boxGeometry args={[0.16, 0.008, 0.002]} />
            <meshBasicMaterial color={PALETTE.greenGlow} />
          </mesh>
        </group>
      )}
    </group>
  );
};
