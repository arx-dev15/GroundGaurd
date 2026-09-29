'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookOpen, UploadCloud, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ZeroKnowledgeStateProps {
  projectId: string;
}

export function ZeroKnowledgeState({ projectId }: ZeroKnowledgeStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto my-auto space-y-4 animate-in fade-in duration-300">
      <div className="w-12 h-12 rounded-xl bg-muted/70 border border-border/80 flex items-center justify-center text-muted-foreground shadow-2xs">
        <BookOpen className="h-6 w-6 stroke-[1.75]" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          No ready knowledge yet
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          GroundGuard needs project knowledge before it can produce evidence-grounded answers.
        </p>
      </div>

      <div className="pt-2">
        <Button asChild size="sm" className="gap-2 text-xs font-medium">
          <Link href={`/projects/${projectId}/knowledge`}>
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Add knowledge</span>
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
