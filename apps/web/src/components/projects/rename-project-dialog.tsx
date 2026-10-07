'use client';

import * as React from 'react';
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
import { Loader2, Pencil, Check } from 'lucide-react';

interface RenameProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (updatedProject: Project) => void;
}

export function RenameProjectDialog({
  project,
  open,
  onOpenChange,
  onRenamed,
}: RenameProjectDialogProps) {
  const [name, setName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (project) {
      setName(project.name);
      setError(null);
      setIsSubmitting(false);
    }
  }, [project, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!name.trim()) {
      setError('Project name cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiClient.patch<{ project: Project }>(
        `/v1/projects/${project.id}`,
        { name: name.trim() }
      );

      onRenamed(response.project);
      onOpenChange(false);
    } catch (err) {
      setError('Failed to rename project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            <span>Rename workspace</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update the title of &ldquo;{project?.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="renameProjectInput" className="text-xs font-medium text-foreground block">
              Workspace Name
            </label>
            <Input
              id="renameProjectInput"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              className="h-9 text-xs"
              required
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
              disabled={isSubmitting || !name.trim()}
              className="text-xs font-semibold gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save changes</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
