'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './Materials';

interface DataFlowTubesProps {
  active?: boolean;
  liveMode?: boolean;
  recoveryActive?: boolean;
  verifiedActive?: boolean;
}

export const DataFlowTubes: React.FC<DataFlowTubesProps> = ({
  active = true,
  liveMode = false,
  recoveryActive = false,
  verifiedActive = false,
}) => {
  const pulsePacket1Ref = useRef<THREE.Mesh>(null);
  const pulsePacket2Ref = useRef<THREE.Mesh>(null);
  const pulsePacketRecoveryRef = useRef<THREE.Mesh>(null);
  const pulsePacketOutputRef = useRef<THREE.Mesh>(null);

  // 1. Path: Ingestion (Left Palm -> Wrist -> Forearm -> Elbow -> Shoulder -> Spine)
  const ingestionCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.76, 0.05, 0.20),
      new THREE.Vector3(-0.75, -0.02, 0.15),
      new THREE.Vector3(-0.74, 0.14, 0.08),
      new THREE.Vector3(-0.72, 0.24, 0.02),
      new THREE.Vector3(-0.67, 0.34, 0.00),
      new THREE.Vector3(-0.35, 0.32, -0.22),
      new THREE.Vector3(0, 0.30, -0.38),
    ]);
  }, []);

  // 2. Path: Spine -> Brain (Ascending Vertebral Bus to Head Chamber)
  const spineToBrainCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.30, -0.38),
      new THREE.Vector3(0, 0.58, -0.36),
      new THREE.Vector3(0, 0.82, -0.25),
      new THREE.Vector3(0, 1.02, -0.05),
      new THREE.Vector3(0, 1.08, 0.08),
    ]);
  }, []);

  // 3. Path: Brain -> Trust Core (Descent through Neck into Chest Instrument)
  const brainToCoreCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.08, 0.08),
      new THREE.Vector3(0, 0.75, 0.20),
      new THREE.Vector3(0, 0.45, 0.36),
      new THREE.Vector3(0, 0.22, 0.44),
    ]);
  }, []);

  // 4. Path: Recovery Loop (Trust Core -> Spine Bus -> Head -> Return to Core)
  const recoveryLoopCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.22, 0.20, 0.44),
      new THREE.Vector3(0.18, 0.22, 0.10),
      new THREE.Vector3(0.04, 0.32, -0.35),
      new THREE.Vector3(0.02, 0.75, -0.30),
      new THREE.Vector3(0.0, 1.05, 0.05),
      new THREE.Vector3(-0.02, 0.75, -0.25),
      new THREE.Vector3(0.0, 0.35, -0.35),
      new THREE.Vector3(0.12, 0.22, 0.15),
      new THREE.Vector3(0.22, 0.20, 0.44),
    ]);
  }, []);

  // 5. Path: Trust Core -> Right Arm Output (Core -> Staging -> Shoulder -> Elbow -> Forearm -> Palm)
  const outputCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.22, 0.44),
      new THREE.Vector3(0.28, 0.22, 0.38),
      new THREE.Vector3(0.45, 0.30, 0.18),
      new THREE.Vector3(0.67, 0.34, 0.00),
      new THREE.Vector3(0.72, 0.24, 0.02),
      new THREE.Vector3(0.74, 0.14, 0.08),
      new THREE.Vector3(0.75, -0.02, 0.15),
      new THREE.Vector3(0.76, 0.05, 0.20),
    ]);
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Pulse 1: Ingestion flow along left arm into spine
    if (pulsePacket1Ref.current) {
      const p = (t * 0.42) % 1;
      const point = ingestionCurve.getPoint(p);
      pulsePacket1Ref.current.position.copy(point);
    }

    // Pulse 2: Brain to Trust Core
    if (pulsePacket2Ref.current) {
      const p = ((t + 0.3) * 0.38) % 1;
      const point = brainToCoreCurve.getPoint(p);
      pulsePacket2Ref.current.position.copy(point);
    }

    // Pulse Recovery: Amber packet loops when active
    if (pulsePacketRecoveryRef.current) {
      if (recoveryActive) {
        pulsePacketRecoveryRef.current.visible = true;
        const p = (t * 0.45) % 1;
        const point = recoveryLoopCurve.getPoint(p);
        pulsePacketRecoveryRef.current.position.copy(point);
      } else {
        pulsePacketRecoveryRef.current.visible = false;
      }
    }

    // Pulse Output: Green verified stream to right hand
    if (pulsePacketOutputRef.current) {
      if (verifiedActive || liveMode) {
        pulsePacketOutputRef.current.visible = true;
        const p = (t * 0.48) % 1;
        const point = outputCurve.getPoint(p);
        pulsePacketOutputRef.current.position.copy(point);
      } else {
        pulsePacketOutputRef.current.visible = false;
      }
    }
  });

  if (!liveMode && !recoveryActive && !verifiedActive) {
    return null;
  }

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. INTERNAL OPTICAL FIBER CONDUITS (Subtle, Translucent Paths) */}
      {/* ============================================================== */}
      {/* Ingestion Conduit (Left Arm) */}
      <mesh>
        <tubeGeometry args={[ingestionCurve, 48, 0.006, 8, false]} />
        <meshStandardMaterial
          color={PALETTE.cyanGlow}
          emissive={PALETTE.cyanGlow}
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Spine to Brain Conduit */}
      <mesh>
        <tubeGeometry args={[spineToBrainCurve, 24, 0.006, 8, false]} />
        <meshStandardMaterial
          color={PALETTE.cyanGlow}
          emissive={PALETTE.cyanGlow}
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Brain to Core Conduit */}
      <mesh>
        <tubeGeometry args={[brainToCoreCurve, 32, 0.006, 8, false]} />
        <meshStandardMaterial
          color={PALETTE.cyanGlow}
          emissive={PALETTE.cyanGlow}
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Recovery Loop Conduit (Amber) */}
      {recoveryActive && (
        <mesh>
          <tubeGeometry args={[recoveryLoopCurve, 48, 0.006, 8, false]} />
          <meshStandardMaterial
            color={PALETTE.amberGlow}
            emissive={PALETTE.amberGlow}
            emissiveIntensity={1.0}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* Output Conduit (Right Arm) */}
      <mesh>
        <tubeGeometry args={[outputCurve, 48, 0.006, 8, false]} />
        <meshStandardMaterial
          color={verifiedActive ? PALETTE.greenGlow : PALETTE.cyanGlow}
          emissive={verifiedActive ? PALETTE.greenGlow : PALETTE.cyanGlow}
          emissiveIntensity={verifiedActive ? 1.0 : 0.5}
          transparent
          opacity={verifiedActive ? 0.5 : 0.25}
        />
      </mesh>

      {/* ============================================================== */}
      {/* 2. REAL-TIME SIGNAL PULSE PACKETS                              */}
      {/* ============================================================== */}
      <mesh ref={pulsePacket1Ref}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshStandardMaterial
          color={PALETTE.whiteHot}
          emissive={PALETTE.cyanGlow}
          emissiveIntensity={2.0}
        />
      </mesh>

      <mesh ref={pulsePacket2Ref}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshStandardMaterial
          color={PALETTE.cyanGlow}
          emissive={PALETTE.cyanGlow}
          emissiveIntensity={1.8}
        />
      </mesh>

      <mesh ref={pulsePacketRecoveryRef} visible={false}>
        <sphereGeometry args={[0.024, 16, 16]} />
        <meshStandardMaterial
          color={PALETTE.amberGlow}
          emissive={PALETTE.amberGlow}
          emissiveIntensity={2.2}
        />
      </mesh>

      <mesh ref={pulsePacketOutputRef} visible={false}>
        <sphereGeometry args={[0.024, 16, 16]} />
        <meshStandardMaterial
          color={PALETTE.whiteHot}
          emissive={PALETTE.greenGlow}
          emissiveIntensity={2.4}
        />
      </mesh>
    </group>
  );
};
