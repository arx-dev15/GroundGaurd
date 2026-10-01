'use client';

import * as React from 'react';
import { useReducedMotion } from 'framer-motion';

interface Point3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  color: string;
  pulsePhase: number;
}

interface Dhadhi3DCanvasProps {
  className?: string;
  interactive?: boolean;
  density?: 'low' | 'normal' | 'high';
  themeAccent?: 'cyan' | 'emerald' | 'violet';
}

export function Dhadhi3DCanvas({
  className = '',
  interactive = true,
  density = 'normal',
  themeAccent = 'cyan',
}: Dhadhi3DCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse coordinates in normalized viewport (-1 to 1)
    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive || shouldReduceMotion) return;
      mouseX = (e.clientX / width) * 2 - 1;
      mouseY = (e.clientY / height) * 2 - 1;
      targetRotY = mouseX * 0.45;
      targetRotX = -mouseY * 0.35;
    };

    window.addEventListener('resize', handleResize);
    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Node Count
    const nodeCount = density === 'high' ? 85 : density === 'low' ? 35 : 55;
    const points: Point3D[] = [];

    // Color Palette
    const colors =
      themeAccent === 'emerald'
        ? ['rgba(16, 185, 129, 0.85)', 'rgba(52, 211, 153, 0.65)', 'rgba(6, 95, 70, 0.4)']
        : themeAccent === 'violet'
        ? ['rgba(168, 85, 247, 0.85)', 'rgba(192, 132, 252, 0.65)', 'rgba(107, 33, 168, 0.4)']
        : ['rgba(6, 182, 212, 0.85)', 'rgba(59, 130, 246, 0.65)', 'rgba(14, 116, 144, 0.4)'];

    // Generate 3D Point Constellation
    for (let i = 0; i < nodeCount; i++) {
      const radius = 350 + Math.random() * 250;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta) * 0.65; // flatten slightly
      const z = radius * Math.cos(phi);

      points.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        vz: (Math.random() - 0.5) * 0.3,
        radius: 1.5 + Math.random() * 2.2,
        color: colors[i % colors.length],
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // 3D Grid Plane Definition (Isometric floor wireframe)
    const gridSize = 24;
    const gridSpacing = 48;
    const gridElevation = 180;

    let time = 0;

    const render = () => {
      time += 0.012;
      ctx.clearRect(0, 0, width, height);

      // Smooth rotation dampening towards mouse target
      if (!shouldReduceMotion) {
        currentRotX += (targetRotX - currentRotX) * 0.05;
        currentRotY += (targetRotY - currentRotY) * 0.05;
      }

      const fov = 650;
      const cx = width / 2;
      const cy = height / 2 + 30;

      const cosY = Math.cos(currentRotY + time * 0.1);
      const sinY = Math.sin(currentRotY + time * 0.1);
      const cosX = Math.cos(currentRotX + 0.25); // natural tilt
      const sinX = Math.sin(currentRotX + 0.25);

      // 1. RENDER 3D AMBIENT TOPOGRAPHIC GRID
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.06)';

      const projectedGrid: { sx: number; sy: number; depth: number }[][] = [];

      for (let i = -gridSize / 2; i <= gridSize / 2; i++) {
        const row: { sx: number; sy: number; depth: number }[] = [];
        for (let j = -gridSize / 2; j <= gridSize / 2; j++) {
          const gx = i * gridSpacing;
          const gz = j * gridSpacing;
          // Harmonic wave equation for 3D fluid topography
          const gy =
            gridElevation +
            Math.sin(i * 0.3 + time) * 12 +
            Math.cos(j * 0.3 + time * 0.8) * 14;

          // Rotate Y
          const x1 = gx * cosY - gz * sinY;
          const z1 = gx * sinY + gz * cosY;

          // Rotate X
          const y2 = gy * cosX - z1 * sinX;
          const z2 = gy * sinX + z1 * cosX + 800;

          if (z2 > 10) {
            const scale = fov / z2;
            const sx = cx + x1 * scale;
            const sy = cy + y2 * scale;
            row.push({ sx, sy, depth: z2 });
          } else {
            row.push({ sx: -9999, sy: -9999, depth: 0 });
          }
        }
        projectedGrid.push(row);
      }

      // Draw grid lines
      for (let i = 0; i < projectedGrid.length; i++) {
        for (let j = 0; j < projectedGrid[i].length; j++) {
          const pt = projectedGrid[i][j];
          if (pt.sx === -9999) continue;

          // Horizontal wire
          if (j + 1 < projectedGrid[i].length && projectedGrid[i][j + 1].sx !== -9999) {
            const nextPt = projectedGrid[i][j + 1];
            const alpha = Math.max(0, 0.07 - (pt.depth / 2000) * 0.06);
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pt.sx, pt.sy);
            ctx.lineTo(nextPt.sx, nextPt.sy);
            ctx.stroke();
          }

          // Vertical wire
          if (i + 1 < projectedGrid.length && projectedGrid[i + 1][j].sx !== -9999) {
            const nextPt = projectedGrid[i + 1][j];
            const alpha = Math.max(0, 0.07 - (pt.depth / 2000) * 0.06);
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pt.sx, pt.sy);
            ctx.lineTo(nextPt.sx, nextPt.sy);
            ctx.stroke();
          }
        }
      }

      // 2. PROJECT 3D EVIDENCE CONSTELLATION NODES
      const projectedPoints: {
        sx: number;
        sy: number;
        scale: number;
        p: Point3D;
        depth: number;
      }[] = [];

      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Autonomous slow drift
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        if (Math.abs(p.x) > 420) p.vx *= -1;
        if (Math.abs(p.y) > 280) p.vy *= -1;
        if (Math.abs(p.z) > 420) p.vz *= -1;

        // Apply 3D matrix rotation
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;

        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX + 700;

        if (z2 > 50) {
          const scale = fov / z2;
          const sx = cx + x1 * scale;
          const sy = cy + y2 * scale;

          projectedPoints.push({ sx, sy, scale, p, depth: z2 });
        }
      }

      // Sort by depth (painters algorithm)
      projectedPoints.sort((a, b) => b.depth - a.depth);

      // 3. DRAW 3D CONNECTOR TETHERS
      ctx.lineWidth = 1;
      const maxDistance = 140;

      for (let i = 0; i < projectedPoints.length; i++) {
        const ptA = projectedPoints[i];
        for (let j = i + 1; j < projectedPoints.length; j++) {
          const ptB = projectedPoints[j];
          const dx = ptA.p.x - ptB.p.x;
          const dy = ptA.p.y - ptB.p.y;
          const dz = ptA.p.z - ptB.p.z;
          const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist3D < maxDistance) {
            const alpha = (1 - dist3D / maxDistance) * 0.22;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(ptA.sx, ptA.sy);
            ctx.lineTo(ptB.sx, ptB.sy);
            ctx.stroke();
          }
        }
      }

      // 4. DRAW NODES & CORONA PULSE
      for (const pt of projectedPoints) {
        const pulse = Math.sin(time * 2 + pt.p.pulsePhase) * 0.4 + 1;
        const r = Math.max(1, pt.p.radius * pt.scale * pulse);

        // Ambient radial glow
        const gradient = ctx.createRadialGradient(
          pt.sx,
          pt.sy,
          0,
          pt.sx,
          pt.sy,
          r * 4.5
        );
        gradient.addColorStop(0, pt.p.color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, r * 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Core dense bead
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [interactive, density, themeAccent, shouldReduceMotion]);

  return (
    <div
      className={`absolute inset-0 pointer-events-none select-none overflow-hidden z-0 ${className}`}
      aria-hidden="true"
    >
      {/* Background Radial Light Accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-cyan-500/10 via-emerald-500/10 to-indigo-500/0 blur-[130px] rounded-full pointer-events-none" />

      {/* 3D Hardware Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block opacity-85" />

      {/* Micro-Dot Hex Mesh Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px] opacity-40 mix-blend-overlay pointer-events-none" />
    </div>
  );
}
