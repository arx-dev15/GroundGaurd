'use client';

import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { StoryChapter } from '../../types/architecture';
import { Sentinel } from './Sentinel';
import { DataFlowTubes } from './DataFlowTubes';
import { ArtifactVisuals } from './ArtifactVisuals';
import { EnvironmentEffects } from './EnvironmentEffects';

interface SceneControllerProps {
  currentChapter: StoryChapter;
  explodeProgress: number;
  liveFlowActive?: boolean;
  demoConflict?: boolean;
}

export const SceneController: React.FC<SceneControllerProps> = ({
  currentChapter,
  explodeProgress,
  liveFlowActive = false,
  demoConflict = true,
}) => {
  const { camera, pointer } = useThree();

  const isHero = currentChapter.index === 0;

  // Target camera vectors for smooth interpolation
  const targetCamPos = useRef(new THREE.Vector3(...currentChapter.camera.position));
  const targetCamLook = useRef(new THREE.Vector3(...currentChapter.camera.target));
  const currentCamLook = useRef(new THREE.Vector3(...currentChapter.camera.target));

  useFrame((_, delta) => {
    // Only drive camera programmatically when not in free Hero orbit mode
    if (!isHero) {
      targetCamPos.current.set(...currentChapter.camera.position);
      targetCamLook.current.set(...currentChapter.camera.target);

      // Subtle pointer parallax offset
      const parallaxX = pointer.x * 0.25;
      const parallaxY = pointer.y * 0.15;

      const desiredX = targetCamPos.current.x + parallaxX;
      const desiredY = targetCamPos.current.y + parallaxY;
      const desiredZ = targetCamPos.current.z;

      // Smooth lerp camera position
      const lerpFactor = Math.min(1.0, delta * 3.2);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, lerpFactor);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, lerpFactor);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, lerpFactor);

      // Smooth lerp camera lookAt target
      currentCamLook.current.lerp(targetCamLook.current, lerpFactor);
      camera.lookAt(currentCamLook.current);
    }
  });

  const flags = currentChapter.visualFlags || {};

  return (
    <>
      {/* Free Interactive Orbit during Hero Idle */}
      {isHero && (
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2.6}
          maxDistance={6.0}
          maxPolarAngle={Math.PI * 0.68}
          minPolarAngle={Math.PI * 0.25}
          dampingFactor={0.06}
          target={[-0.12, 0.38, 0]}
        />
      )}

      {/* Studio Lighting & Atmosphere */}
      <EnvironmentEffects />

      {/* The Central Modular GroundGuard Sentinel */}
      <Sentinel
        explodeProgress={explodeProgress ?? (currentChapter.explodeProgress ?? 0)}
        trustCoreStatus={flags.trustCoreState || 'idle'}
        highlightSubsystem={currentChapter.highlightSubsystem}
        activeRegion={currentChapter.activeRegion}
        showHybridSplit={flags.showHybridSplit}
        showRerankLattice={flags.showRerankLattice}
        showGenerationCore={flags.showGenerationCore}
        showRecoveryBranch={flags.showRecoveryBranch}
      />

      {/* Embedded 3D Data Flow Splines and Animated Pulses */}
      <DataFlowTubes
        active={true}
        liveMode={liveFlowActive}
        recoveryActive={flags.showRecoveryBranch || flags.trustCoreState === 'recovery'}
        verifiedActive={Boolean(flags.showOutputAssembly)}
      />

      {/* Document, Query and Claim Artifacts */}
      <ArtifactVisuals
        showIngestionDoc={flags.showIngestionDoc}
        showQueryPacket={flags.showQueryPacket}
        showClaimCards={flags.showClaimCards}
        showRecoveryBranch={flags.showRecoveryBranch}
        showReverification={flags.showReverification}
        showOutputAssembly={flags.showOutputAssembly}
        showVerifiedBadge={flags.showVerifiedBadge}
        trustCoreState={flags.trustCoreState}
        demoConflict={demoConflict}
      />
    </>
  );
};
