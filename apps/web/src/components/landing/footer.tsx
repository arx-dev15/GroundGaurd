import * as React from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full py-12 px-6 border-t border-border/50 select-none bg-background transition-colors duration-300">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded bg-foreground text-background flex items-center justify-center">
            <Shield className="h-3 w-3" />
          </div>
          <span className="font-semibold text-xs tracking-tight text-foreground">
            EvideX AI
          </span>
          <span className="text-[11px] text-muted-foreground/60 font-mono ml-2">
            Verifiable Claim Grounding
          </span>
        </div>

        {/* Real Section Anchors */}
        <nav className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground" aria-label="Footer Navigation">
          <a href="#how-it-works" className="hover:text-foreground transition-colors">
            How It Works
          </a>
          <a href="#verification" className="hover:text-foreground transition-colors">
            Verification
          </a>
          <a href="#inspector" className="hover:text-foreground transition-colors">
            Inspector
          </a>
          <a href="#provenance" className="hover:text-foreground transition-colors">
            Provenance
          </a>
          <a href="#security" className="hover:text-foreground transition-colors">
            Security
          </a>
          <a href="#reliability" className="hover:text-foreground transition-colors">
            Reliability
          </a>
        </nav>

        {/* Copyright */}
        <div className="text-[11px] font-mono text-muted-foreground/70">
          © {currentYear} EvideX AI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
