'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { StoryChapter } from '../../types/architecture';
import { SceneController } from './SceneController';

interface GroundGuardCanvasProps {
  currentChapter: StoryChapter;
  explodeProgress: number;
  liveFlowActive?: boolean;
  demoConflict?: boolean;
}

export const GroundGuardCanvas: React.FC<GroundGuardCanvasProps> = ({
  currentChapter,
  explodeProgress,
  liveFlowActive = false,
  demoConflict = true,
}) => {
  return (
    <div className="fixed inset-0 w-full h-full pointer-events-auto z-0">
      <Canvas
        camera={{
          position: [1.15, 0.50, 4.0],
          fov: 42,
          near: 0.1,
          far: 50,
        }}
        dpr={[1, typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        className="w-full h-full pointer-events-auto"
      >
        <Suspense fallback={null}>
          <SceneController
            currentChapter={currentChapter}
            explodeProgress={explodeProgress}
            liveFlowActive={liveFlowActive}
            demoConflict={demoConflict}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
