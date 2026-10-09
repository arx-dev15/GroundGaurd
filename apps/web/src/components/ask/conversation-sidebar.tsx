'use client';

import * as React from 'react';
import { MessageSquare, Plus, ChevronLeft, ChevronRight, MoreHorizontal, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Conversation } from '@groundguard/types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  /**
   * Deletes a conversation through an authorized backend operation. Must reject on failure.
   * When omitted (no server contract available), the Delete action is shown disabled with an explanation.
   */
  onDeleteConversation?: (conversationId: string) => Promise<void>;
  isLoading?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isLoading = false,
  isCollapsed = false,
  onToggleCollapse,
  className,
}: ConversationSidebarProps) {
  const [pendingDelete, setPendingDelete] = React.useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const closeDialog = (open: boolean) => {
    if (open || isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !onDeleteConversation) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteConversation(pendingDelete.id);
      setPendingDelete(null); // only close after the server confirmed deletion
    } catch (err: any) {
      setDeleteError(err?.message || 'The conversation could not be deleted. Nothing was removed.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isCollapsed) {
    return (
      <div className={cn('w-12 border-r border-border/60 bg-card/30 flex flex-col items-center py-3 gap-2 shrink-0 select-none', className)}>
        <button
          type="button"
          onClick={onNewConversation}
          title="New conversation"
          className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand history"
          className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Expand conversations sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className={cn('w-[240px] border-r border-border/60 bg-card/20 flex flex-col h-full shrink-0 select-none', className)} aria-label="Conversation history">
      <div className="p-3 border-b border-border/50 flex items-center justify-between gap-2">
        <Button onClick={onNewConversation} variant="outline" size="sm" className="flex-1 justify-start gap-1.5 text-xs font-medium h-8 bg-background/70 hover:bg-background">
          <Plus className="h-3.5 w-3.5" />
          <span>New conversation</span>
        </Button>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse history"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Collapse conversations sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        <div className="px-2 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between">
          <span>Conversations</span>
          {!isLoading && <span className="tabular-nums">{conversations.length}</span>}
        </div>

        {isLoading ? (
          <div className="p-2 space-y-2" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse space-y-1.5 px-2 py-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted/60 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground/80">No conversations yet. Ask a question to start one.</div>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              const timeAgo = formatRelativeTime(conv.updatedAt || conv.createdAt);
              const title = conv.title || 'Untitled conversation';
              return (
                <li
                  key={conv.id}
                  className={cn(
                    'group relative flex items-center rounded-lg transition-colors',
                    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex-1 min-w-0 text-left pl-2.5 pr-8 py-2 rounded-lg text-xs flex flex-col gap-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-2 w-full min-w-0">
                      <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground/80')} />
                      <span className={cn('truncate flex-1', isActive && 'font-medium')} title={title}>
                        {title}
                      </span>
                    </span>
                    {timeAgo && <span className="text-[10px] text-muted-foreground/70 pl-[22px] tabular-nums">{timeAgo}</span>}
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for “${title}”`}
                        className={cn(
                          'absolute right-1 top-1.5 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/80 transition-opacity',
                          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                        )}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        disabled={!onDeleteConversation}
                        onSelect={() => {
                          if (!onDeleteConversation) return;
                          setDeleteError(null);
                          setPendingDelete(conv);
                        }}
                        className="text-destructive focus:text-destructive gap-2 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="flex flex-col">
                          <span>Delete conversation…</span>
                          {!onDeleteConversation && (
                            <span className="text-[10px] text-muted-foreground font-normal">Not yet supported by the server</span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete conversation?
            </DialogTitle>
            <DialogDescription className="text-sm">
              <span className="block font-medium text-foreground break-words">“{pendingDelete?.title || 'Untitled conversation'}”</span>
              <span className="block mt-1.5">Its messages and answers will be permanently removed. Project documents are not affected. This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {deleteError}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => closeDialog(false)} disabled={isDeleting} autoFocus>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={isDeleting} className="gap-1.5">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
