'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  MessageSquareCode,
  Sparkles,
  Shield,
  ShieldCheck,
  Send,
  Loader2,
  FileText,
  AlertCircle,
  Database,
  History,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AskComposer } from '@/components/ask/ask-composer';
import { ZeroKnowledgeState } from '@/components/ask/zero-knowledge-state';
import { AnswerView } from '@/components/ask/answer-view';
import { AskInspector } from '@/components/ask/ask-inspector';
import { ConversationSidebar } from '@/components/ask/conversation-sidebar';
import { useProjectDocuments } from '@/lib/documents-query';
import {
  useProjectConversations,
  useConversationMessages,
  useCreateConversation,
  useSendMessage,
  useGenerationClaims,
} from '@/lib/conversations-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Project, Conversation, Message, Claim, EvidenceItem } from '@groundguard/types';

export default function AskPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const projectId = (params?.projectId as string) || '';
  const convParam = searchParams.get('c');

  // Project data
  const [project, setProject] = React.useState<Project | null>(null);
  React.useEffect(() => {
    if (!projectId) return;
    apiClient
      .get<{ project: Project }>(`/v1/projects/${projectId}`)
      .then((res) => setProject(res.project))
      .catch(() => null);
  }, [projectId]);

  // Documents data to check ready knowledge
  const { data: documents = [], isLoading: isLoadingDocs } = useProjectDocuments(projectId);
  const readyDocuments = documents.filter((d) => d.status === 'ready');
  const hasReadyKnowledge = readyDocuments.length > 0;

  // Conversations query
  const { data: conversations = [], refetch: refetchConversations } = useProjectConversations(projectId);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(convParam || null);

  // Sync activeConversationId with URL query
  React.useEffect(() => {
    if (convParam && convParam !== activeConversationId) {
      setActiveConversationId(convParam);
    }
  }, [convParam]);

  // Messages query for active conversation
  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    refetch: refetchMessages,
  } = useConversationMessages(projectId, activeConversationId);

  // Composer input state
  const [inputValue, setInputValue] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Inspector state
  const [selectedClaim, setSelectedClaim] = React.useState<Claim | null>(null);
  const [selectedEvidence, setSelectedEvidence] = React.useState<EvidenceItem | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  // Global Evidence Lens reading mode
  const [isEvidenceLens, setIsEvidenceLens] = React.useState(false);

  // Sidebar collapse toggle
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Claims cache for loaded generations in active conversation
  const [generationClaimsMap, setGenerationClaimsMap] = React.useState<Record<string, Claim[]>>({});

  // Mutations
  const createConversationMutation = useCreateConversation(projectId);
  const sendMessageMutation = useSendMessage(projectId, activeConversationId || '');

  // Load claims for assistant messages that have a generationId
  React.useEffect(() => {
    messages.forEach((msg) => {
      if (msg.role === 'assistant' && msg.generationId && !generationClaimsMap[msg.generationId]) {
        apiClient
          .get<{ claims: Claim[] }>(`/v1/generations/${msg.generationId}/claims`)
          .then((res) => {
            if (res?.claims) {
              setGenerationClaimsMap((prev) => ({
                ...prev,
                [msg.generationId!]: res.claims,
              }));
            }
          })
          .catch(() => null);
      }
    });
  }, [messages]);

  // Submit Handler: Handles both initial question (Hero) and follow-up (Compact)
  const handleSubmit = async (overrideText?: string) => {
    const textToSend = (overrideText ?? inputValue).trim();
    if (!textToSend || isSubmitting) return;

    setIsSubmitting(true);
    setInputValue('');

    try {
      let targetConvId = activeConversationId;

      // 1. If no active conversation, create one first
      if (!targetConvId) {
        const titleSnippet = textToSend.slice(0, 48);
        const newConv = await createConversationMutation.mutateAsync(titleSnippet);
        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);
        router.push(`/projects/${projectId}/ask?c=${newConv.id}`);
      }

      // 2. Send query message to M3
      const res = await apiClient.post<any>(
        `/v1/projects/${projectId}/conversations/${targetConvId}/messages`,
        { content: textToSend }
      );

      // Cache returned claims for this generation
      if (res?.generationId && res?.claims) {
        setGenerationClaimsMap((prev) => ({
          ...prev,
          [res.generationId]: res.claims,
        }));
      }

      // Refresh messages and conversation list
      await Promise.all([refetchMessages(), refetchConversations()]);
    } catch (err: any) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch to new conversation state
  const handleNewConversation = () => {
    setActiveConversationId(null);
    setSelectedClaim(null);
    setSelectedEvidence(null);
    setInspectorOpen(false);
    router.push(`/projects/${projectId}/ask`);
  };

  // Select a claim to inspect
  const handleSelectClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setSelectedEvidence(null);
    setInspectorOpen(true);
  };

  // Select an evidence chunk to inspect
  const handleSelectEvidence = (ev: EvidenceItem) => {
    setSelectedEvidence(ev);
    setInspectorOpen(true);
  };

  const isHeroState = !activeConversationId && messages.length === 0;

  // Auto-scroll messages container to bottom on update
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  return (
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-border/70 bg-background shadow-xs">
      {/* 1. Left Conversation History Sidebar (Active Conversation state only) */}
      {!isHeroState && (
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            router.push(`/projects/${projectId}/ask?c=${id}`);
          }}
          onNewConversation={handleNewConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex"
        />
      )}

      {/* 2. Main Center Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {/* Zero Knowledge State */}
        {!isLoadingDocs && !hasReadyKnowledge ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6">
            <ZeroKnowledgeState projectId={projectId} />
            <div className="w-full max-w-xl mt-6">
              <AskComposer
                mode="hero"
                value=""
                onChange={() => {}}
                onSubmit={() => {}}
                disabled
                readyDocuments={[]}
                placeholder="Add knowledge to start asking grounded questions."
              />
            </div>
          </div>
        ) : isHeroState ? (
          // ============================================================
          // 1. NEW CONVERSATION STATE (Linear Agent inspired surface)
          // ============================================================
          <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 overflow-y-auto">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl text-center space-y-4 mb-8"
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/60 text-muted-foreground text-[11px] font-mono select-none">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Grounded Agentic Research</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
                Ask your knowledge
              </h1>

              <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                GroundGuard retrieves evidence from this project&apos;s ready knowledge and verifies factual claims in the response.
              </p>
            </motion.div>

            {/* Dominant Hero Composer */}
            <AskComposer
              mode="hero"
              value={inputValue}
              onChange={setInputValue}
              onSubmit={() => handleSubmit()}
              isLoading={isSubmitting}
              readyDocuments={readyDocuments}
              onSelectExample={(text) => {
                setInputValue(text);
                handleSubmit(text);
              }}
            />
          </div>
        ) : (
          // ============================================================
          // 2. ACTIVE CONVERSATION STATE (GroundGuard Research Workspace)
          // ============================================================
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Workspace Bar */}
            <div className="px-4 py-2.5 border-b border-border/50 bg-card/40 flex items-center justify-between select-none">
              <div className="flex items-center gap-2 truncate">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewConversation}
                  className="h-7 text-xs gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>New Chat</span>
                </Button>
                <span className="text-border">|</span>
                <span className="text-xs font-medium text-foreground truncate">
                  {conversations.find((c) => c.id === activeConversationId)?.title || 'Active Conversation'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="hidden sm:inline">
                  {readyDocuments.length} ready {readyDocuments.length === 1 ? 'doc' : 'docs'}
                </span>
              </div>
            </div>

            {/* Transcript Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const assistantClaims = msg.generationId ? generationClaimsMap[msg.generationId] || [] : [];

                if (isUser) {
                  return (
                    <div
                      key={msg.id || index}
                      className="max-w-3xl space-y-1 pt-3 pb-1 border-b border-border/20"
                    >
                      <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                        YOU
                      </div>
                      <div className="text-sm sm:text-base text-foreground font-normal leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Assistant Verified Response Area
                return (
                  <div key={msg.id || index} className="max-w-3xl space-y-2 pb-6">
                    <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      <span>GROUNDGUARD RESPONSE</span>
                    </div>

                    <AnswerView
                      answerText={msg.content}
                      claims={assistantClaims}
                      projectId={projectId}
                      selectedClaimId={selectedClaim?.claimId}
                      onSelectClaim={handleSelectClaim}
                      onSelectEvidence={handleSelectEvidence}
                      isEvidenceLens={isEvidenceLens}
                      onToggleEvidenceLens={() => setIsEvidenceLens(!isEvidenceLens)}
                      onAskAnother={() => {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                          textarea.focus();
                        }
                      }}
                    />
                  </div>
                );
              })}

              {/* In-flight Generating Indicator */}
              {isSubmitting && (
                <div className="max-w-3xl space-y-1.5 animate-in fade-in duration-200">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground pl-1 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>Retrieving evidence & synthesizing verified answer...</span>
                  </div>
                  <div className="p-4 rounded-xl border border-border/60 bg-card/30 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted/60 animate-pulse" />
                    <div className="h-4 w-5/6 rounded bg-muted/40 animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-muted/30 animate-pulse" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Persistent Compact Bottom Composer */}
            <div className="p-3 sm:p-4 border-t border-border/60 bg-background/80 backdrop-blur-sm">
              <AskComposer
                mode="compact"
                value={inputValue}
                onChange={setInputValue}
                onSubmit={() => handleSubmit()}
                isLoading={isSubmitting}
                readyDocuments={readyDocuments}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Contextual Inspector (Phoenix/LangSmith inspired drill-down) */}
      <AskInspector
        claim={selectedClaim}
        selectedEvidence={selectedEvidence}
        projectId={projectId}
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
