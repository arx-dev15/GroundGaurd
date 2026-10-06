'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

export const EnvironmentEffects: React.FC = () => {
  // Generate a dynamic radial soft contact shadow texture (restrained and natural)
  const shadowTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(256, 256, 15, 256, 256, 220);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.28)'); // Soft charcoal contact core
    grad.addColorStop(0.35, 'rgba(15, 23, 42, 0.12)');
    grad.addColorStop(0.7, 'rgba(15, 23, 42, 0.03)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. PRODUCT PHOTOGRAPHY LIGHTING RIG                            */}
      {/* ============================================================== */}
      {/* Soft Ambient Fill */}
      <ambientLight intensity={0.65} color="#ffffff" />

      {/* Hemisphere Light for soft sky/ground gradient */}
      <hemisphereLight
        color="#ffffff"
        groundColor="#94a3b8"
        intensity={0.45}
        position={[0, 10, 0]}
      />

      {/* Main Studio Key Light (Upper-left front: sculpts head, visor & chest curves) */}
      <directionalLight
        position={[-4.5, 6.2, 5.0]}
        intensity={1.65}
        color="#fffcf7"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />

      {/* Opposite Fill Light (Upper-right front: softens right-side shadows) */}
      <directionalLight
        position={[4.5, 3.5, 3.5]}
        intensity={0.65}
        color="#f1f5f9"
      />

      {/* Silhouette Cool Rim Light (Upper rear: crisp edge highlight on pearl white) */}
      <directionalLight
        position={[0, 5.8, -4.2]}
        intensity={1.2}
        color="#e0f2fe"
      />

      {/* Bottom Subtle Ground Bounce */}
      <directionalLight
        position={[0, -3.5, 2]}
        intensity={0.22}
        color="#cbd5e1"
      />

      {/* ============================================================== */}
      {/* 2. RESTRAINED SOFT CONTACT SHADOW (No multiple giant rings)    */}
      {/* ============================================================== */}
      {shadowTexture && (
        <mesh position={[0, -1.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.0, 1.4]} />
          <meshBasicMaterial
            map={shadowTexture}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};
