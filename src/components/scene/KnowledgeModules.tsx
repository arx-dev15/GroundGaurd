'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './Materials';

interface KnowledgeModulesProps {
  highlighted?: boolean;
}

export const KnowledgeModules: React.FC<KnowledgeModulesProps> = ({
  highlighted = false,
}) => {
  const bayGroupRef = useRef<THREE.Group>(null);
  const canonicalRecordRef = useRef<THREE.Group>(null);
  const qdrantLatticeRef = useRef<THREE.Group>(null);
  const networkxLatticeRef = useRef<THREE.Group>(null);
  const tantivyBarsRef = useRef<THREE.Group>(null);

  // Signal branch pulses from canonical record to the 3 derived representations
  const branchPulseQdrant = useRef<THREE.Mesh>(null);
  const branchPulseTantivy = useRef<THREE.Mesh>(null);
  const branchPulseNetworkX = useRef<THREE.Mesh>(null);
  const redisSpinePulse = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Subtle internal activity when highlighted
    if (canonicalRecordRef.current) {
      const pulse = 1.0 + Math.sin(t * 3.0) * 0.04;
      canonicalRecordRef.current.scale.set(pulse, pulse, 1.0);
    }

    if (qdrantLatticeRef.current) {
      qdrantLatticeRef.current.rotation.y += delta * 0.5;
    }

    if (networkxLatticeRef.current) {
      networkxLatticeRef.current.rotation.y += delta * 0.6;
    }

    if (tantivyBarsRef.current) {
      tantivyBarsRef.current.children.forEach((child, i) => {
        child.position.y = 0.005 * Math.sin(t * 3.5 + i * 0.9);
      });
    }

    // Fast transient Redis pulse ascending central spine
    if (redisSpinePulse.current) {
      const p = (t * 1.6) % 1.0;
      redisSpinePulse.current.position.y = THREE.MathUtils.lerp(-0.15, 0.18, p);
    }

    // Branching signal pulses from Canonical Record to derived stores
    const cycle = (t * 0.45) % 1.0;
    if (branchPulseQdrant.current && branchPulseTantivy.current && branchPulseNetworkX.current) {
      if (highlighted && cycle > 0.25 && cycle < 0.75) {
        const p = (cycle - 0.25) / 0.5;
        // From Canonical [0, 0.08, 0] to Qdrant [-0.14, 0, 0]
        branchPulseQdrant.current.visible = true;
        branchPulseQdrant.current.position.set(
          THREE.MathUtils.lerp(0, -0.14, p),
          THREE.MathUtils.lerp(0.08, 0, p),
          0.02
        );

        // From Canonical to Tantivy [0.14, 0, 0]
        branchPulseTantivy.current.visible = true;
        branchPulseTantivy.current.position.set(
          THREE.MathUtils.lerp(0, 0.14, p),
          THREE.MathUtils.lerp(0.08, 0, p),
          0.02
        );

        // From Canonical to NetworkX [0, -0.09, 0]
        branchPulseNetworkX.current.visible = true;
        branchPulseNetworkX.current.position.set(
          0,
          THREE.MathUtils.lerp(0.08, -0.09, p),
          0.02
        );
      } else {
        branchPulseQdrant.current.visible = false;
        branchPulseTantivy.current.visible = false;
        branchPulseNetworkX.current.visible = false;
      }
    }
  });

  return (
    <group ref={bayGroupRef} position={[0, -0.16, 0.20]}>
      {/* Central Spinal Bus Conduit & Fast Redis Pulse */}
      <mesh position={[0, 0, -0.01]}>
        <cylinderGeometry args={[0.003, 0.003, 0.32, 8]} />
        <meshBasicMaterial color={PALETTE.cyanSoft} transparent opacity={0.4} />
      </mesh>
      <mesh ref={redisSpinePulse} position={[0, 0, -0.01]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshBasicMaterial color={PALETTE.whiteHot} />
      </mesh>

      {/* Internal Optical Conduits connecting Canonical record to derived stores */}
      <mesh position={[-0.07, 0.04, 0]} rotation={[0, 0, 0.55]}>
        <cylinderGeometry args={[0.0018, 0.0018, 0.16, 6]} />
        <meshBasicMaterial color={PALETTE.cyanSoft} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.07, 0.04, 0]} rotation={[0, 0, -0.55]}>
        <cylinderGeometry args={[0.0018, 0.0018, 0.16, 6]} />
        <meshBasicMaterial color={PALETTE.cyanSoft} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, -0.01, 0]}>
        <cylinderGeometry args={[0.0018, 0.0018, 0.16, 6]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.6} />
      </mesh>

      {/* Dynamic Branching Light Pulses */}
      <mesh ref={branchPulseQdrant} visible={false}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color={PALETTE.whiteHot} />
      </mesh>
      <mesh ref={branchPulseTantivy} visible={false}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color={PALETTE.whiteHot} />
      </mesh>
      <mesh ref={branchPulseNetworkX} visible={false}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color="#c4b5fd" />
      </mesh>

      {/* ============================================================== */}
      {/* 1. CANONICAL STRUCTURED RECORD (PostgreSQL State)               */}
      {/* Luminous structured tablet with schema rows                    */}
      {/* ============================================================== */}
      <group ref={canonicalRecordRef} position={[0, 0.08, 0.01]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.16, 0.065]} />
          <meshBasicMaterial color="#0b172a" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
        <lineSegments position={[0, 0, 0.001]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(0.16, 0.065)]} />
          <lineBasicMaterial color={PALETTE.cyanSignal} transparent opacity={0.9} />
        </lineSegments>
        {/* Ledger Schema Strips */}
        {[-0.014, 0.0, 0.014].map((y, idx) => (
          <mesh key={`can-row-${idx}`} position={[0, y, 0.003]}>
            <planeGeometry args={[0.12, 0.006]} />
            <meshBasicMaterial color={PALETTE.cyanGlow} transparent opacity={highlighted ? 0.95 : 0.6} />
          </mesh>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 2. SEMANTIC VECTOR PATTERN (Qdrant Dense Representation)       */}
      {/* Floating vector point cluster in left bay                      */}
      {/* ============================================================== */}
      <group position={[-0.14, 0, 0.01]}>
        <group ref={qdrantLatticeRef}>
          {[-0.024, 0, 0.024].map((x, xi) =>
            [-0.018, 0.018].map((y, yi) => (
              <mesh key={`sem-pt-${xi}-${yi}`} position={[x, y, 0]}>
                <sphereGeometry args={[0.006, 8, 8]} />
                <meshBasicMaterial color={PALETTE.cyanGlow} />
              </mesh>
            ))
          )}
        </group>
      </group>

      {/* ============================================================== */}
      {/* 3. LEXICAL TOKEN PATTERN (Tantivy Inverted Index Marks)        */}
      {/* Horizontal luminous token identifier bands in right bay       */}
      {/* ============================================================== */}
      <group position={[0.14, 0, 0.01]}>
        <group ref={tantivyBarsRef}>
          {[-0.028, -0.009, 0.009, 0.028].map((x, idx) => (
            <mesh key={`lex-band-${idx}`} position={[x, 0, 0]}>
              <boxGeometry args={[0.008, 0.045, 0.002]} />
              <meshStandardMaterial
                color={PALETTE.cyanSoft}
                emissive={PALETTE.cyanSoft}
                emissiveIntensity={highlighted ? 1.8 : 0.9}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* ============================================================== */}
      {/* 4. RELATIONSHIP GRAPH PATTERN (NetworkX Topology)              */}
      {/* Violet node-edge constellation in bottom bay                   */}
      {/* ============================================================== */}
      <group position={[0, -0.09, 0.01]}>
        <group ref={networkxLatticeRef}>
          {[
            [-0.03, 0.012, 0],
            [0.03, 0.012, 0],
            [0, -0.015, 0],
          ].map(([nx, ny, nz], idx) => (
            <mesh key={`rel-pt-${idx}`} position={[nx, ny, nz]}>
              <sphereGeometry args={[0.008, 8, 8]} />
              <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={1.8} />
            </mesh>
          ))}
          {/* Struts */}
          <mesh position={[0, 0.012, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.0014, 0.0014, 0.05, 6]} />
            <meshBasicMaterial color="#c4b5fd" />
          </mesh>
          <mesh position={[-0.015, -0.002, 0]} rotation={[0, 0, 0.6]}>
            <cylinderGeometry args={[0.0014, 0.0014, 0.05, 6]} />
            <meshBasicMaterial color="#c4b5fd" />
          </mesh>
          <mesh position={[0.015, -0.002, 0]} rotation={[0, 0, -0.6]}>
            <cylinderGeometry args={[0.0014, 0.0014, 0.05, 6]} />
            <meshBasicMaterial color="#c4b5fd" />
          </mesh>
        </group>
      </group>
    </group>
  );
};
