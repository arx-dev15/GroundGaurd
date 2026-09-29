'use client';

import * as React from 'react';
import {
  MessageSquare,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Conversation } from '@groundguard/types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isCollapsed = false,
  onToggleCollapse,
  className,
}: ConversationSidebarProps) {
  if (isCollapsed) {
    return (
      <div
        className={cn(
          'w-12 border-r border-border/70 bg-card/40 flex flex-col items-center py-3 gap-2 shrink-0 select-none',
          className
        )}
      >
        <button
          type="button"
          onClick={onNewConversation}
          title="New conversation"
          className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity shadow-2xs"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand history"
          className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors"
          aria-label="Expand conversations sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'w-64 border-r border-border/70 bg-card/30 flex flex-col h-full shrink-0 select-none',
        className
      )}
      aria-label="Conversation History"
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-border/50 flex items-center justify-between gap-2">
        <Button
          onClick={onNewConversation}
          variant="outline"
          size="sm"
          className="flex-1 justify-start gap-1.5 text-xs font-medium h-8 bg-background/80 hover:bg-background"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New conversation</span>
        </Button>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse history"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Collapse conversations sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          History ({conversations.length})
        </div>

        {conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground/70 italic">
            No past conversations yet.
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 group',
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <MessageSquare
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span className="truncate flex-1">
                  {conv.title || 'Untitled conversation'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
