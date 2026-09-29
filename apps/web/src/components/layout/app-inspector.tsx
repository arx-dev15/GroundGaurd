'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  ShieldCheck,
  FileText,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export interface AppInspectorProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}

export function AppInspector({
  title = 'Trust Inspector',
  subtitle = 'Claim Verification & Evidence Lineage',
  children,
  className,
}: AppInspectorProps) {
  const shouldReduceMotion = useReducedMotion();
  const { inspectorOpen, setInspectorOpen, isDesktop, isMobile } = useShell();

  // Close with Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectorOpen) {
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectorOpen, setInspectorOpen]);

  // Default neutral placeholder when no specific claim or evidence is passed
  const placeholderContent = (
    <div className="space-y-4 text-xs">
      <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-2">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Trust Inspector</span>
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Select any verified statement, evidence marker, or citation in your workspace to inspect its full grounding lineage, NLI cross-encoder scores, and provenance.
        </p>
      </div>

      <div className="p-3 rounded-lg border border-border/50 bg-muted/20 text-center py-6 space-y-1">
        <p className="text-xs text-muted-foreground">
          No claim currently selected.
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Click a claim or citation in Ask to view details here.
        </p>
      </div>
    </div>
  );

  // Tablet & Mobile Sheet View
  if (!isDesktop) {
    return (
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'p-0 flex flex-col z-50 bg-background/95 backdrop-blur-md border-border/80 shadow-2xl',
            isMobile ? 'max-h-[85vh] rounded-t-xl' : 'w-full sm:max-w-md'
          )}
        >
          <SheetHeader className="p-4 border-b border-border/70 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <div>
                <SheetTitle className="text-xs font-semibold text-foreground">{title}</SheetTitle>
                <p className="text-[10px] text-muted-foreground font-mono">{subtitle}</p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">{children || placeholderContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Sliding Aside (smooth layout resize for main content)
  return (
    <motion.aside
      initial={false}
      animate={{
        width: inspectorOpen ? 390 : 0,
        opacity: inspectorOpen ? 1 : 0,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
      }
      className={cn(
        'shrink-0 border-l border-border/70 bg-card/40 backdrop-blur-md z-20 flex flex-col select-none overflow-hidden h-screen sticky top-0',
        !inspectorOpen && 'border-l-0 pointer-events-none',
        className
      )}
      aria-label="Trust Inspector"
      aria-hidden={!inspectorOpen}
    >
      <div className="w-[390px] h-full flex flex-col">
        {/* Header */}
        <div className="h-12 border-b border-border/70 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate leading-tight">
                {title}
              </span>
              <span className="text-[10px] text-muted-foreground truncate leading-tight font-mono">
                {subtitle}
              </span>
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  aria-label="Close Inspector (Esc)"
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs flex items-center gap-1.5">
                <span>Close Inspector</span>
                <span className="text-[10px] font-mono text-muted-foreground">Esc</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">{children || placeholderContent}</div>
      </div>
    </motion.aside>
  );
}
