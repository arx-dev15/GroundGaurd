'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Sparkles, FileText, Database, Layers, Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Document } from '@groundguard/types';

interface AskComposerProps {
  mode: 'hero' | 'compact';
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  readyDocuments?: Document[];
  placeholder?: string;
  onSelectExample?: (text: string) => void;
  className?: string;
}

const DEFAULT_EXAMPLES = [
  'Compare information across sources',
  'Find evidence for a technical claim',
  'Explain key concepts from project documents',
];

export function AskComposer({
  mode,
  value,
  onChange,
  onSubmit,
  disabled = false,
  isLoading = false,
  readyDocuments = [],
  placeholder,
  onSelectExample,
  className,
}: AskComposerProps) {
  const shouldReduceMotion = useReducedMotion();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const readyCount = readyDocuments.length;

  // Auto-resize up to ~7 lines then internal scroll
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = mode === 'hero' ? 180 : 140;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim().length > 0) {
        onSubmit();
      }
    }
  };

  const isHero = mode === 'hero';

  return (
    <motion.div
      layout={!shouldReduceMotion}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.35,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn('w-full', isHero ? 'max-w-2xl mx-auto' : 'max-w-3xl mx-auto', className)}
    >
      {/* Outer Composer Container */}
      <div
        className={cn(
          'group relative rounded-xl border bg-card/95 transition-all duration-200',
          'border-border/80 shadow-xs focus-within:border-border focus-within:shadow-sm focus-within:ring-1 focus-within:ring-border/80',
          disabled && 'opacity-60 bg-muted/20 cursor-not-allowed',
          isHero ? 'p-3.5 sm:p-4' : 'p-2.5 sm:p-3'
        )}
      >
        {/* Multiline Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          rows={isHero ? 3 : 1}
          placeholder={
            placeholder ||
            (readyCount === 0
              ? 'Add knowledge to start asking grounded questions.'
              : disabled
              ? 'GroundGuard is temporarily unavailable...'
              : isHero
              ? 'Ask a question about this project...'
              : 'Ask a follow-up question...')
          }
          className={cn(
            'w-full resize-none bg-transparent outline-none text-foreground placeholder:text-muted-foreground/70 leading-relaxed font-sans',
            isHero ? 'text-sm sm:text-base min-h-[72px]' : 'text-xs sm:text-sm min-h-[36px]',
            'scrollbar-thin scrollbar-thumb-border'
          )}
        />

        {/* Bottom Toolbar: Context Indicator + Submit Action */}
        <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/40 select-none">
          {/* Bottom-left: Project Evidence Scope with Informational Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] font-mono transition-colors rounded-md px-2 py-1',
                  readyCount > 0
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    : 'text-muted-foreground/60 cursor-default'
                )}
                aria-label="Project knowledge scope"
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    readyCount > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
                <span className="truncate">
                  {readyCount > 0
                    ? `Evidence-backed · ${readyCount} ${readyCount === 1 ? 'doc' : 'docs'} ready`
                    : 'No ready documents'}
                </span>
              </button>
            </PopoverTrigger>
            {readyCount > 0 && (
              <PopoverContent
                side={isHero ? 'bottom' : 'top'}
                align="start"
                sideOffset={6}
                className="w-64 p-2.5 text-xs bg-popover/95 backdrop-blur-sm border border-border shadow-md space-y-1.5 z-50 text-popover-foreground"
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground border-b border-border/50 pb-1.5">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  <span>Project Knowledge Scope</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  GroundGuard retrieves evidence exclusively from {readyCount} indexed and verified project documents:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pt-1 pr-1 scrollbar-thin">
                  {readyDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between text-[11px] p-1.5 rounded bg-muted/40 border border-border/40"
                    >
                      <span className="flex items-center gap-1.5 truncate text-foreground font-medium">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{doc.filename}</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">
                        {doc.chunksCount} {doc.chunksCount === 1 ? 'chunk' : 'chunks'}
                      </span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            )}
          </Popover>

          {/* Bottom-right: Submit Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || isLoading || value.trim().length === 0}
              className={cn(
                'inline-flex items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'bg-foreground text-background dark:bg-foreground dark:text-background hover:opacity-90 active:scale-95',
                'disabled:opacity-25 disabled:pointer-events-none disabled:active:scale-100 shadow-2xs',
                isHero ? 'h-8 w-8' : 'h-7 w-7'
              )}
              aria-label="Send query"
            >
              {isLoading ? (
                <Loader2 className={cn('animate-spin', isHero ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
              ) : (
                <ArrowUp className={cn('stroke-[2.5]', isHero ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Suggested Example Prompts (Rendered underneath in Hero state) */}
      {isHero && !disabled && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="mt-6 space-y-2 text-center"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Try asking
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {DEFAULT_EXAMPLES.map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelectExample?.(example)}
                className="text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/70 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-150 text-left cursor-pointer select-none"
              >
                {example}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
