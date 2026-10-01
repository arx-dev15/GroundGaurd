'use client';

import * as React from 'react';
import Link from 'next/link';

interface DhadhiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  href?: string;
}

export function DhadhiLogo({
  className = '',
  size = 'md',
  showTagline = false,
  href = '/',
}: DhadhiLogoProps) {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 38 : 30;
  const textSize =
    size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl font-black' : 'text-lg font-bold';

  const content = (
    <div className={`inline-flex items-center gap-2.5 group select-none ${className}`}>
      {/* 3D Glowing Hex Shield Emblem */}
      <div
        className="relative flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
        style={{ width: iconSize, height: iconSize }}
      >
        {/* Ambient Neon Back-glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/40 to-emerald-500/40 rounded-lg blur-[6px] opacity-75 group-hover:opacity-100 transition-opacity" />

        {/* SVG Isometric Shield / Neural Node */}
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
        >
          {/* Outer Isometric Facets */}
          <polygon
            points="18,3 32,10 32,26 18,33 4,26 4,10"
            className="fill-slate-950 stroke-cyan-500/80 dark:fill-slate-900"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Top Plane */}
          <polygon
            points="18,3 32,10 18,17 4,10"
            fill="url(#dhadhi-top-grad)"
            className="opacity-75"
          />
          {/* Left Core Facet */}
          <polygon
            points="4,10 18,17 18,33 4,26"
            fill="url(#dhadhi-left-grad)"
            className="opacity-90"
          />
          {/* Right Core Facet */}
          <polygon
            points="18,17 32,10 32,26 18,33"
            fill="url(#dhadhi-right-grad)"
            className="opacity-90"
          />
          {/* Core Grounding Node Center */}
          <circle cx="18" cy="17" r="2.8" className="fill-white animate-pulse" />
          <path
            d="M18 10L18 24M11 13L25 21M25 13L11 21"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          <defs>
            <linearGradient id="dhadhi-top-grad" x1="4" y1="3" x2="32" y2="17" gradientUnits="userSpaceOnUse">
              <stop stopColor="#06b6d4" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="dhadhi-left-grad" x1="4" y1="10" x2="18" y2="33" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="1" stopColor="#0891b2" />
            </linearGradient>
            <linearGradient id="dhadhi-right-grad" x1="32" y1="10" x2="18" y2="33" gradientUnits="userSpaceOnUse">
              <stop stopColor="#059669" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`${textSize} tracking-tight font-sans text-foreground tracking-widest font-extrabold uppercase bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text`}
          >
            DHADHI
          </span>
          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 font-semibold tracking-wider">
            AI
          </span>
        </div>
        {showTagline && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/80 mt-0.5">
            Grounded Reliability
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-md">
        {content}
      </Link>
    );
  }

  return content;
}
