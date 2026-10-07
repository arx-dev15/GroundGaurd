'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@groundguard/contracts';
import { apiClient } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, ArrowRight } from 'lucide-react';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: Project) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset fields when dialog closes/opens
  React.useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiClient.post<{ project: Project }>('/v1/projects', {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      onOpenChange(false);
      if (onCreated) {
        onCreated(response.project);
      }
      router.push(`/projects/${response.project.id}/overview`);
    } catch (err) {
      setError('Failed to create project. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <span>Create new evidence workspace</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            A project provides an isolated workspace for your source documents,
            conversations, claims, and verification telemetry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="modalProjectName" className="text-xs font-medium text-foreground block">
              Project Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="modalProjectName"
              autoFocus
              placeholder="e.g. Enterprise Knowledge Base"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="modalProjectDesc" className="text-xs font-medium text-foreground block">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="modalProjectDesc"
              placeholder="What domain or evidence will this workspace contain?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs min-h-[76px] resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating workspace...</span>
                </>
              ) : (
                <>
                  <span>Create workspace</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
