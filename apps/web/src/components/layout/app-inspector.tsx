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

  // Default neutral placeholder demonstrating future Claim / Evidence / Recovery slots
  const placeholderContent = (
    <div className="space-y-4 text-xs">
      {/* Readiness Notice */}
      <div className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-1.5">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Contextual Evidence Architecture</span>
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          The Trust Inspector is docked to the workspace. When investigating claims in Ask or Knowledge, factual assertions connect directly to supporting passages and verification scores here.
        </p>
      </div>

      {/* Slot 1: Active Claim Structure */}
      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Selected Claim
          </span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
            Pending selection
          </Badge>
        </div>
        <p className="text-muted-foreground italic text-[11px]">
          Click any verified or flagged statement in the workspace to inspect its grounding lineage.
        </p>
      </div>

      {/* Slot 2: Evidence Lineage Structure */}
      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            <span>Document Provenance</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">—</span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 w-3/4 rounded bg-muted/60 animate-pulse" />
          <div className="h-2 w-1/2 rounded bg-muted/40 animate-pulse" />
        </div>
      </div>

      {/* Slot 3: NLI Verification Score Structure */}
      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span>NLI Diagnostics</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">0.00</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
          <div className="h-full w-0 bg-status-verified transition-all" />
        </div>
      </div>

      {/* Slot 4: Observability Trace Structure */}
      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            <span>Observability Trace</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">Ready</span>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/70 space-y-0.5">
          <div className="flex justify-between">
            <span>Model:</span>
            <span>nli-deberta-v3-large</span>
          </div>
          <div className="flex justify-between">
            <span>Threshold:</span>
            <span>0.78 strict</span>
          </div>
        </div>
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
