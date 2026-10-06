'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { SubsystemType, ActiveBodyRegion } from '../../types/architecture';
import { PALETTE } from './Materials';
import { BrainCore } from './BrainCore';
import { TrustCore } from './TrustCore';
import { KnowledgeModules } from './KnowledgeModules';

interface SentinelProps {
  explodeProgress?: number;
  trustCoreStatus?: 'idle' | 'evaluating' | 'verified' | 'contradiction' | 'recovery';
  highlightSubsystem?: SubsystemType;
  activeRegion?: ActiveBodyRegion;
  showHybridSplit?: boolean;
  showRerankLattice?: boolean;
  showGenerationCore?: boolean;
  showRecoveryBranch?: boolean;
  showOutputAssembly?: boolean;
}

export const Sentinel: React.FC<SentinelProps> = ({
  explodeProgress = 0,
  trustCoreStatus = 'idle',
  highlightSubsystem = 'sentinel',
  activeRegion = 'idle',
  showHybridSplit = false,
  showRerankLattice = false,
  showGenerationCore = false,
  showRecoveryBranch = false,
  showOutputAssembly = false,
}) => {
  const sentinelGroupRef = useRef<THREE.Group>(null);

  // Arm pivot hierarchies
  const leftShoulderRef = useRef<THREE.Group>(null);
  const leftElbowRef = useRef<THREE.Group>(null);
  const leftWristRef = useRef<THREE.Group>(null);

  const rightShoulderRef = useRef<THREE.Group>(null);
  const rightElbowRef = useRef<THREE.Group>(null);
  const rightWristRef = useRef<THREE.Group>(null);

  // Material refs for Selective X-Ray
  const chestMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const torsoMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const lowerChassisMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const leftShoulderMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const leftBicepMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const leftForearmMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const rightShoulderMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const rightBicepMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const rightForearmMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // Subsystem focus flags
  const isBrainFocused = highlightSubsystem === 'brain';
  const isTrustFocused = highlightSubsystem === 'trust_core' || highlightSubsystem === 'recovery';
  const isKnowledgeFocused = highlightSubsystem === 'knowledge';
  const isLeftArmFocused = highlightSubsystem === 'left_arm';
  const isRightArmFocused = highlightSubsystem === 'right_arm';

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Natural floating oscillation (restrained & calm)
    if (sentinelGroupRef.current) {
      sentinelGroupRef.current.position.y = Math.sin(t * 1.3) * 0.022;
    }

    // 1. Articulated Left Arm (Input Reception Pose vs Relaxed Idle)
    if (leftShoulderRef.current && leftElbowRef.current && leftWristRef.current) {
      if (isLeftArmFocused) {
        // Arm articulates forward, elbow flexes, wrist rotates: receiving palm presents upward
        leftShoulderRef.current.rotation.x = THREE.MathUtils.lerp(leftShoulderRef.current.rotation.x, -0.42, delta * 3.5);
        leftShoulderRef.current.rotation.z = THREE.MathUtils.lerp(leftShoulderRef.current.rotation.z, 0.20, delta * 3.5);
        leftElbowRef.current.rotation.x = THREE.MathUtils.lerp(leftElbowRef.current.rotation.x, -0.52, delta * 3.5);
        leftWristRef.current.rotation.y = THREE.MathUtils.lerp(leftWristRef.current.rotation.y, 0.48, delta * 3.5);
        leftWristRef.current.rotation.x = THREE.MathUtils.lerp(leftWristRef.current.rotation.x, -0.15, delta * 3.5);
      } else {
        // Natural relaxed resting companion idle pose (gentle outward flare, soft natural elbow bend)
        const idleSway = Math.sin(t * 1.4) * 0.018;
        leftShoulderRef.current.rotation.x = THREE.MathUtils.lerp(leftShoulderRef.current.rotation.x, 0.06 + idleSway, delta * 2.8);
        leftShoulderRef.current.rotation.z = THREE.MathUtils.lerp(leftShoulderRef.current.rotation.z, 0.22, delta * 2.8);
        leftElbowRef.current.rotation.x = THREE.MathUtils.lerp(leftElbowRef.current.rotation.x, -0.22, delta * 2.8);
        leftWristRef.current.rotation.y = THREE.MathUtils.lerp(leftWristRef.current.rotation.y, 0.18, delta * 2.8);
        leftWristRef.current.rotation.x = THREE.MathUtils.lerp(leftWristRef.current.rotation.x, 0.0, delta * 2.8);
      }
    }

    // 4. Articulated Right Arm (Output Presentation Pose vs Relaxed Idle)
    if (rightShoulderRef.current && rightElbowRef.current && rightWristRef.current) {
      if (isRightArmFocused || showOutputAssembly || (highlightSubsystem === 'sentinel' && trustCoreStatus === 'verified')) {
        // Arm extends outward and forward, presenting verified document over palm
        rightShoulderRef.current.rotation.x = THREE.MathUtils.lerp(rightShoulderRef.current.rotation.x, -0.45, delta * 3.5);
        rightShoulderRef.current.rotation.z = THREE.MathUtils.lerp(rightShoulderRef.current.rotation.z, -0.22, delta * 3.5);
        rightElbowRef.current.rotation.x = THREE.MathUtils.lerp(rightElbowRef.current.rotation.x, -0.54, delta * 3.5);
        rightWristRef.current.rotation.y = THREE.MathUtils.lerp(rightWristRef.current.rotation.y, -0.48, delta * 3.5);
        rightWristRef.current.rotation.x = THREE.MathUtils.lerp(rightWristRef.current.rotation.x, -0.15, delta * 3.5);
      } else {
        // Natural relaxed companion idle pose
        const idleSway = Math.sin(t * 1.4 + 1.2) * 0.018;
        rightShoulderRef.current.rotation.x = THREE.MathUtils.lerp(rightShoulderRef.current.rotation.x, 0.06 + idleSway, delta * 2.8);
        rightShoulderRef.current.rotation.z = THREE.MathUtils.lerp(rightShoulderRef.current.rotation.z, -0.22, delta * 2.8);
        rightElbowRef.current.rotation.x = THREE.MathUtils.lerp(rightElbowRef.current.rotation.x, -0.22, delta * 2.8);
        rightWristRef.current.rotation.y = THREE.MathUtils.lerp(rightWristRef.current.rotation.y, -0.18, delta * 2.8);
        rightWristRef.current.rotation.x = THREE.MathUtils.lerp(rightWristRef.current.rotation.x, 0.0, delta * 2.8);
      }
    }

    // -------------------------------------------------------------
    // SELECTIVE X-RAY: Smoothly interpolate shell opacities per region
    // Prompt Section 8: idle ~0.98, active ~0.40–0.55
    // -------------------------------------------------------------
    const targetChestOpacity = (activeRegion === 'chest' || isTrustFocused) ? 0.44 : 0.98;
    const targetTorsoOpacity = (activeRegion === 'torso' || activeRegion === 'spine' || isKnowledgeFocused) ? 0.46 : 0.98;
    const targetLeftArmOpacity = (activeRegion === 'left_arm' || isLeftArmFocused) ? 0.46 : 0.98;
    const targetRightArmOpacity = (activeRegion === 'right_arm' || isRightArmFocused || showOutputAssembly) ? 0.46 : 0.98;

    const xRaySpeed = delta * 4.0;
    if (chestMatRef.current) {
      chestMatRef.current.opacity = THREE.MathUtils.lerp(chestMatRef.current.opacity, targetChestOpacity, xRaySpeed);
    }
    if (torsoMatRef.current) {
      torsoMatRef.current.opacity = THREE.MathUtils.lerp(torsoMatRef.current.opacity, targetTorsoOpacity, xRaySpeed);
    }
    if (lowerChassisMatRef.current) {
      lowerChassisMatRef.current.opacity = THREE.MathUtils.lerp(lowerChassisMatRef.current.opacity, targetTorsoOpacity, xRaySpeed);
    }
    if (leftShoulderMatRef.current) {
      leftShoulderMatRef.current.opacity = THREE.MathUtils.lerp(leftShoulderMatRef.current.opacity, targetLeftArmOpacity, xRaySpeed);
    }
    if (leftBicepMatRef.current) {
      leftBicepMatRef.current.opacity = THREE.MathUtils.lerp(leftBicepMatRef.current.opacity, targetLeftArmOpacity, xRaySpeed);
    }
    if (leftForearmMatRef.current) {
      leftForearmMatRef.current.opacity = THREE.MathUtils.lerp(leftForearmMatRef.current.opacity, targetLeftArmOpacity, xRaySpeed);
    }
    if (rightShoulderMatRef.current) {
      rightShoulderMatRef.current.opacity = THREE.MathUtils.lerp(rightShoulderMatRef.current.opacity, targetRightArmOpacity, xRaySpeed);
    }
    if (rightBicepMatRef.current) {
      rightBicepMatRef.current.opacity = THREE.MathUtils.lerp(rightBicepMatRef.current.opacity, targetRightArmOpacity, xRaySpeed);
    }
    if (rightForearmMatRef.current) {
      rightForearmMatRef.current.opacity = THREE.MathUtils.lerp(rightForearmMatRef.current.opacity, targetRightArmOpacity, xRaySpeed);
    }
  });

  return (
    <group ref={sentinelGroupRef} position={[0, 0, 0]} scale={1.08}>
      {/* ============================================================== */}
      {/* 1. SCULPTED HEAD & VISOR (Precision Clamshell Opening)         */}
      {/* ============================================================== */}
      <BrainCore
        explodeProgress={explodeProgress}
        highlighted={isBrainFocused}
        activeRegion={activeRegion}
        showHybridSplit={showHybridSplit}
        showRerankLattice={showRerankLattice}
        showGenerationCore={showGenerationCore}
      />

      {/* ============================================================== */}
      {/* 2. ELEGANT CONCAVE NECK COLLAR & PIVOT STEM                    */}
      {/* ============================================================== */}
      <group position={[0, 0.48, 0]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.44, 0.16, 32]} />
          <meshPhysicalMaterial
            color={PALETTE.warmGrey}
            roughness={0.25}
            metalness={0.12}
            clearcoat={0.5}
          />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.20, 24]} />
          <meshStandardMaterial
            color={PALETTE.jointGraphite}
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 3. SCULPTED PEAR / SHIELD TORSO CHASSIS                        */}
      {/* ============================================================== */}
      <group position={[0, 0.0, 0]}>
        {/* Upper Chest Main Hull (Pearl White Ceramic) */}
        <group position={[0, 0.16, 0]}>
          <RoundedBox args={[1.16, 0.66, 0.78]} radius={0.30} smoothness={8}>
            <meshPhysicalMaterial
              ref={chestMatRef}
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

        {/* ============================================================ */}
        {/* 4. INTEGRATED TRUST CORE (Signature Verification Instrument) */}
        {/* ============================================================ */}
        <group position={[0, 0.18, 0.402]}>
          <mesh position={[0, 0, -0.004]}>
            <circleGeometry args={[0.226, 48]} />
            <meshBasicMaterial color="#080c16" />
          </mesh>
          <mesh position={[0, 0, -0.002]}>
            <ringGeometry args={[0.222, 0.252, 48]} />
            <meshStandardMaterial color={PALETTE.warmGrey} roughness={0.3} metalness={0.2} />
          </mesh>
          <TrustCore
            status={trustCoreStatus}
            scale={0.92}
            highlighted={isTrustFocused}
          />
        </group>

        {/* ============================================================ */}
        {/* 5. MID TORSO & INTERNAL KNOWLEDGE CHAMBER                    */}
        {/* Assembled hull with subtle translucency during knowledge     */}
        {/* ============================================================ */}
        <group position={[0, -0.15, 0]}>
          {/* Main Waist Chassis */}
          <RoundedBox args={[0.98, 0.36, 0.70]} radius={0.24} smoothness={8}>
            <meshPhysicalMaterial
              ref={torsoMatRef}
              color={PALETTE.pearlWhite}
              roughness={0.24}
              metalness={0.08}
              clearcoat={0.5}
              transparent
              opacity={0.98}
              depthWrite
            />
          </RoundedBox>

          {/* Internal Knowledge Representation (Canonical Record + 3 Branching Patterns) */}
          <KnowledgeModules highlighted={isKnowledgeFocused} />

          {/* Hairline Anatomical Parting Seam */}
          <mesh position={[0, 0.175, 0.352]}>
            <boxGeometry args={[0.82, 0.006, 0.005]} />
            <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.5} metalness={0.5} />
          </mesh>
        </group>

        {/* Lower Tapered Floating Chassis & Magnetic Suspension Emitter */}
        <group position={[0, -0.40, 0]}>
          <RoundedBox args={[0.80, 0.44, 0.58]} radius={0.26} smoothness={8}>
            <meshPhysicalMaterial
              ref={lowerChassisMatRef}
              color={PALETTE.pearlWhite}
              roughness={0.24}
              metalness={0.08}
              clearcoat={0.5}
              transparent
              opacity={0.98}
              depthWrite
            />
          </RoundedBox>
          <mesh position={[0, -0.20, 0]}>
            <sphereGeometry args={[0.22, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <meshPhysicalMaterial
              color={PALETTE.warmGrey}
              roughness={0.28}
              metalness={0.12}
            />
          </mesh>
          <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.07, 0.14, 32]} />
            <meshStandardMaterial
              color={PALETTE.satinSilver}
              metalness={0.88}
              roughness={0.18}
            />
          </mesh>
          <mesh position={[0, -0.282, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.068, 24]} />
            <meshBasicMaterial color={PALETTE.cyanGlow} transparent opacity={0.65} />
          </mesh>
        </group>

        {/* Slender Engineered Vertebral Spine Data Bus */}
        <group position={[0, 0.04, -0.40]}>
          <mesh>
            <boxGeometry args={[0.11, 0.72, 0.016]} />
            <meshStandardMaterial
              color={PALETTE.warmGrey}
              roughness={0.35}
              metalness={0.2}
            />
          </mesh>
          {[-0.26, -0.09, 0.09, 0.26].map((y, idx) => (
            <mesh key={`spine-node-${idx}`} position={[0, y, 0.008]}>
              <boxGeometry args={[0.085, 0.045, 0.012]} />
              <meshStandardMaterial
                color={PALETTE.jointGraphite}
                metalness={0.7}
                roughness={0.3}
              />
            </mesh>
          ))}
          {/* Central Optical Signal Fiber */}
          <mesh position={[0, 0, 0.012]}>
            <cylinderGeometry args={[0.004, 0.004, 0.68, 12]} />
            <meshBasicMaterial color={PALETTE.cyanGlow} transparent opacity={0.75} />
          </mesh>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 6. ARTICULATED LEFT ARM (INPUT / INGESTION CONDUIT)             */}
      {/* ============================================================== */}
      <group position={[-0.67, 0.28, 0]}>
        <group ref={leftShoulderRef}>
          <group position={[-0.02, 0, 0]}>
            <RoundedBox args={[0.22, 0.24, 0.20]} radius={0.08} smoothness={6}>
              <meshPhysicalMaterial
                ref={leftShoulderMatRef}
                color={PALETTE.pearlWhite}
                roughness={0.22}
                metalness={0.08}
                clearcoat={0.6}
                transparent
                opacity={0.98}
                depthWrite
              />
            </RoundedBox>
            <mesh position={[0.02, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.10, 0.10, 0.04, 24]} />
              <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.085, 0.085, 0.08, 24]} />
              <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
            </mesh>
          </group>

          {/* Upper Arm Chassis */}
          <group position={[-0.04, -0.22, 0]}>
            <RoundedBox args={[0.16, 0.36, 0.15]} radius={0.065} smoothness={6}>
              <meshPhysicalMaterial
                ref={leftBicepMatRef}
                color={PALETTE.pearlWhite}
                roughness={0.22}
                metalness={0.08}
                clearcoat={0.5}
                transparent
                opacity={0.98}
                depthWrite
              />
            </RoundedBox>
            <mesh position={[-0.082, 0, 0]}>
              <boxGeometry args={[0.005, 0.28, 0.06]} />
              <meshStandardMaterial color={PALETTE.warmGrey} roughness={0.3} metalness={0.15} />
            </mesh>
          </group>

          {/* Elbow Hinge */}
          <group ref={leftElbowRef} position={[-0.04, -0.42, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.062, 0.062, 0.13, 24]} />
              <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.88} roughness={0.18} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.042, 0.042, 0.14, 20]} />
              <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
            </mesh>

            {/* Forearm Chassis */}
            <group position={[0, -0.22, 0]}>
              <RoundedBox args={[0.145, 0.36, 0.135]} radius={0.055} smoothness={6}>
                <meshPhysicalMaterial
                  ref={leftForearmMatRef}
                  color={PALETTE.pearlWhite}
                  roughness={0.22}
                  metalness={0.08}
                  clearcoat={0.5}
                  transparent
                  opacity={0.98}
                  depthWrite
                />
              </RoundedBox>
            </group>

            {/* Wrist & Receiving Hand */}
            <group ref={leftWristRef} position={[0, -0.43, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.055, 0.08, 20]} />
                <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.058, 0.058, 0.02, 20]} />
                <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
              </mesh>

              {/* Palm with Ingestion Intake Aperture */}
              <group position={[0, -0.085, 0]}>
                <RoundedBox args={[0.125, 0.085, 0.055]} radius={0.025} smoothness={4}>
                  <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.25} metalness={0.1} />
                </RoundedBox>
                {/* Inductive Intake Sensor Aperture Pad */}
                <mesh position={[0, -0.01, 0.029]}>
                  <circleGeometry args={[0.022, 16]} />
                  <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.8} roughness={0.2} />
                </mesh>
                <mesh position={[0, -0.01, 0.030]}>
                  <circleGeometry args={[0.012, 16]} />
                  <meshBasicMaterial color={PALETTE.cyanGlow} />
                </mesh>
                {/* Fingers */}
                <group position={[-0.035, -0.045, 0.01]}>
                  <mesh position={[0, -0.02, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.035, 12]} />
                    <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.05, 0]}>
                    <capsuleGeometry args={[0.011, 0.035, 8, 12]} />
                    <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.28} metalness={0.1} />
                  </mesh>
                </group>
                <group position={[0.035, -0.045, 0.01]}>
                  <mesh position={[0, -0.02, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.035, 12]} />
                    <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.05, 0]}>
                    <capsuleGeometry args={[0.011, 0.035, 8, 12]} />
                    <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.28} metalness={0.1} />
                  </mesh>
                </group>
                <mesh position={[-0.065, -0.025, -0.018]} rotation={[0.35, 0, 0.55]}>
                  <capsuleGeometry args={[0.013, 0.060, 8, 12]} />
                  <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.6} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 7. ARTICULATED RIGHT ARM (OUTPUT / DELIVERY CONDUIT)           */}
      {/* ============================================================== */}
      <group position={[0.67, 0.28, 0]}>
        <group ref={rightShoulderRef}>
          <group position={[0.02, 0, 0]}>
            <RoundedBox args={[0.22, 0.24, 0.20]} radius={0.08} smoothness={6}>
              <meshPhysicalMaterial
                ref={rightShoulderMatRef}
                color={PALETTE.pearlWhite}
                roughness={0.22}
                metalness={0.08}
                clearcoat={0.6}
                transparent
                opacity={0.98}
                depthWrite
              />
            </RoundedBox>
            <mesh position={[-0.02, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.10, 0.10, 0.04, 24]} />
              <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[-0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.085, 0.085, 0.08, 24]} />
              <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
            </mesh>
          </group>

          {/* Upper Arm Chassis */}
          <group position={[0.04, -0.22, 0]}>
            <RoundedBox args={[0.16, 0.36, 0.15]} radius={0.065} smoothness={6}>
              <meshPhysicalMaterial
                ref={rightBicepMatRef}
                color={PALETTE.pearlWhite}
                roughness={0.22}
                metalness={0.08}
                clearcoat={0.5}
                transparent
                opacity={0.98}
                depthWrite
              />
            </RoundedBox>
            <mesh position={[0.082, 0, 0]}>
              <boxGeometry args={[0.005, 0.28, 0.06]} />
              <meshStandardMaterial color={PALETTE.warmGrey} roughness={0.3} metalness={0.15} />
            </mesh>
          </group>

          {/* Elbow Hinge */}
          <group ref={rightElbowRef} position={[0.04, -0.42, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.062, 0.062, 0.13, 24]} />
              <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.88} roughness={0.18} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.042, 0.042, 0.14, 20]} />
              <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
            </mesh>

            {/* Forearm Chassis */}
            <group position={[0, -0.22, 0]}>
              <RoundedBox args={[0.145, 0.36, 0.135]} radius={0.055} smoothness={6}>
                <meshPhysicalMaterial
                  ref={rightForearmMatRef}
                  color={PALETTE.pearlWhite}
                  roughness={0.22}
                  metalness={0.08}
                  clearcoat={0.5}
                  transparent
                  opacity={0.98}
                  depthWrite
                />
              </RoundedBox>
            </group>

            {/* Wrist & Presenting Hand */}
            <group ref={rightWristRef} position={[0, -0.43, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.055, 0.08, 20]} />
                <meshStandardMaterial color={PALETTE.jointGraphite} metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.058, 0.058, 0.02, 20]} />
                <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.85} roughness={0.2} />
              </mesh>

              {/* Palm with Output Aperture */}
              <group position={[0, -0.085, 0]}>
                <RoundedBox args={[0.125, 0.085, 0.055]} radius={0.025} smoothness={4}>
                  <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.25} metalness={0.1} />
                </RoundedBox>
                {/* Inductive Telemetry Sensor Pad */}
                <mesh position={[0, -0.01, 0.029]}>
                  <circleGeometry args={[0.022, 16]} />
                  <meshStandardMaterial color={PALETTE.satinSilver} metalness={0.8} roughness={0.2} />
                </mesh>
                <mesh position={[0, -0.01, 0.030]}>
                  <circleGeometry args={[0.012, 16]} />
                  <meshBasicMaterial color={PALETTE.greenGlow} />
                </mesh>
                {/* Fingers */}
                <group position={[-0.035, -0.045, 0.01]}>
                  <mesh position={[0, -0.02, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.035, 12]} />
                    <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.05, 0]}>
                    <capsuleGeometry args={[0.011, 0.035, 8, 12]} />
                    <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.28} metalness={0.1} />
                  </mesh>
                </group>
                <group position={[0.035, -0.045, 0.01]}>
                  <mesh position={[0, -0.02, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.035, 12]} />
                    <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.5} />
                  </mesh>
                  <mesh position={[0, -0.05, 0]}>
                    <capsuleGeometry args={[0.011, 0.035, 8, 12]} />
                    <meshStandardMaterial color={PALETTE.pearlWhite} roughness={0.28} metalness={0.1} />
                  </mesh>
                </group>
                <mesh position={[0.065, -0.025, -0.018]} rotation={[0.35, 0, -0.55]}>
                  <capsuleGeometry args={[0.013, 0.060, 8, 12]} />
                  <meshStandardMaterial color={PALETTE.jointGraphite} roughness={0.35} metalness={0.6} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
