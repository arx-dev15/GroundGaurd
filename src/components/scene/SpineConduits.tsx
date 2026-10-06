'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './Materials';

interface SpineConduitsProps {
  explodeProgress?: number;
  active?: boolean;
}

export const SpineConduits: React.FC<SpineConduitsProps> = ({
  explodeProgress = 0,
  active = true,
}) => {
  const centralCoreRef = useRef<THREE.Mesh>(null);
  const redisOrbitRingRef = useRef<THREE.Group>(null);
  const vertebraeGroupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Central luminous spine pulse
    if (centralCoreRef.current) {
      const mat = centralCoreRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.emissiveIntensity = 1.0 + Math.sin(t * 2.8) * 0.4;
      }
    }

    // Redis transient runtime ring fast orbit & pulse (transient cache/stream around spine)
    if (redisOrbitRingRef.current) {
      redisOrbitRingRef.current.rotation.y += delta * 2.4;
      redisOrbitRingRef.current.rotation.x = Math.sin(t * 1.2) * 0.12;
    }

    // Vertebrae micro-expansion
    if (vertebraeGroupRef.current) {
      vertebraeGroupRef.current.children.forEach((child, idx) => {
        const offset = idx * 0.5;
        const s = 1 + Math.sin(t * 3.5 - offset) * 0.03;
        child.scale.set(s, 1, s);
      });
    }
  });

  // Vertebrae collar rings centered across the neck gap and down the torso
  const vertebraeY = [1.52, 1.38, 1.24, 0.96, 0.68, 0.4, 0.12];

  return (
    <group position={[0, 0, -0.05]}>
      {/* Central Luminescent M3 Data Core (Continuous Vertical Cylinder) */}
      <mesh ref={centralCoreRef} position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 1.55, 24]} />
        <meshStandardMaterial
          color={PALETTE.cyanSignal}
          emissive={PALETTE.cyanSignal}
          emissiveIntensity={1.2}
          roughness={0.2}
        />
      </mesh>

      {/* Vertebrae Segment Discs */}
      <group ref={vertebraeGroupRef}>
        {vertebraeY.map((y, i) => (
          <group key={i} position={[0, y, 0]}>
            {/* Precision Satin Silver / Graphite Vertebra Disc */}
            <mesh>
              <cylinderGeometry args={[0.13, 0.13, 0.045, 24]} />
              <meshStandardMaterial
                color={PALETTE.jointGraphite}
                metalness={0.7}
                roughness={0.3}
              />
            </mesh>
            {/* Luminous Inner Ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.11, 0.009, 8, 24]} />
              <meshBasicMaterial color={active ? PALETTE.cyanGlow : PALETTE.satinSilver} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Redis Transient Runtime Orbiting Ring (Floating in the Neck Gap at y = 1.45) */}
      <group ref={redisOrbitRingRef} position={[0, 1.45, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.009, 12, 36]} />
          <meshStandardMaterial
            color={PALETTE.cyanSoft}
            emissive={PALETTE.cyanSoft}
            emissiveIntensity={1.2}
            transparent
            opacity={0.75}
          />
        </mesh>
        {/* Fast Orbiting Event Packet */}
        <mesh position={[0.22, 0, 0]}>
          <sphereGeometry args={[0.024, 12, 12]} />
          <meshBasicMaterial color={PALETTE.whiteHot} />
        </mesh>
      </group>
    </group>
  );
};
