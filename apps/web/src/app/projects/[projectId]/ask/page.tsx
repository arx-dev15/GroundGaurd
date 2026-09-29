'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  MessageSquareCode,
  Sparkles,
  Shield,
  Loader2,
  FileText,
  RotateCcw,
  CheckCircle2,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
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
  conversationQueryKeys,
} from '@/lib/conversations-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Project, Conversation, Message, Claim, EvidenceItem } from '@groundguard/types';

export default function AskPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const projectId = (params?.projectId as string) || '';
  const convParam = searchParams.get('c');

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
    } else if (!convParam && activeConversationId) {
      setActiveConversationId(null);
    }
  }, [convParam, activeConversationId]);

  // Messages query for active conversation
  const {
    data: persistedMessages = [],
    isLoading: isLoadingMessages,
    refetch: refetchMessages,
  } = useConversationMessages(projectId, activeConversationId);

  // Optimistic pending user message state during in-flight request
  const [pendingUserMessage, setPendingUserMessage] = React.useState<Message | null>(null);

  // Composer input state
  const [inputValue, setInputValue] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Inspector state: CLOSED by default
  const [selectedClaim, setSelectedClaim] = React.useState<Claim | null>(null);
  const [selectedEvidence, setSelectedEvidence] = React.useState<EvidenceItem | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  // Global Evidence Lens reading mode
  const [isEvidenceLens, setIsEvidenceLens] = React.useState(false);

  // Sidebar collapse toggle
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Claims cache for loaded generations in active conversation
  const [generationClaimsMap, setGenerationClaimsMap] = React.useState<Record<string, Claim[]>>({});

  // Mutation to create conversation
  const createConversationMutation = useCreateConversation(projectId);

  // Combine persisted messages with any pending in-flight user message
  const messages = React.useMemo(() => {
    if (!pendingUserMessage) return persistedMessages;
    // If the server has already persisted the message, don't duplicate
    const exists = persistedMessages.some(
      (m) => m.content === pendingUserMessage.content && m.role === 'user'
    );
    if (exists) return persistedMessages;
    return [...persistedMessages, pendingUserMessage];
  }, [persistedMessages, pendingUserMessage]);

  // Load claims for assistant messages that have a generationId
  React.useEffect(() => {
    persistedMessages.forEach((msg) => {
      if (msg.role === 'assistant' && msg.generationId && !generationClaimsMap[msg.generationId]) {
        apiClient
          .get<{ claims: Claim[] }>(`/v1/generations/${msg.generationId}/claims`)
          .then((res) => {
            if (res?.claims) {
              setGenerationClaimsMap((prev) => ({
                ...prev,
                [msg.generationId!]: res.claims,
              }));
              queryClient.setQueryData(
                conversationQueryKeys.generationClaims(msg.generationId!),
                res.claims
              );
            }
          })
          .catch(() => null);
      }
    });
  }, [persistedMessages, generationClaimsMap, queryClient]);

  // Submit Handler: Handles both initial question (Hero) and follow-up (Compact)
  const handleSubmit = async (overrideText?: string) => {
    const textToSend = (overrideText ?? inputValue).trim();
    if (!textToSend || isSubmitting) return;

    // 1. Optimistic UI update: show message immediately and clear composer
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId || 'pending',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setPendingUserMessage(tempMsg);
    setInputValue('');
    setIsSubmitting(true);

    try {
      let targetConvId = activeConversationId;

      // 2. If no active conversation, create one first
      if (!targetConvId) {
        const titleSnippet = textToSend.slice(0, 48);
        const newConv = await createConversationMutation.mutateAsync(titleSnippet);
        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);
        router.replace(`/projects/${projectId}/ask?c=${newConv.id}`);
      }

      // 3. Send query message to M3
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
        queryClient.setQueryData(
          conversationQueryKeys.generationClaims(res.generationId),
          res.claims
        );
      }

      // 4. Update TanStack query cache directly for instantaneous display without reload
      if (res?.userMessage && res?.message) {
        queryClient.setQueryData<Message[]>(
          conversationQueryKeys.messages(targetConvId),
          (old = []) => {
            const filtered = old.filter((m) => !m.id.startsWith('temp-'));
            const hasUser = filtered.some((m) => m.id === res.userMessage.id);
            const hasAssistant = filtered.some((m) => m.id === res.message.id);
            const next = [...filtered];
            if (!hasUser) next.push(res.userMessage);
            if (!hasAssistant) next.push(res.message);
            return next;
          }
        );
      }

      // Clear pending message and re-fetch to guarantee cache consistency
      setPendingUserMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.messages(targetConvId) }),
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.projectList(projectId) }),
      ]);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setPendingUserMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch to new conversation state
  const handleNewConversation = () => {
    setActiveConversationId(null);
    setPendingUserMessage(null);
    setSelectedClaim(null);
    setSelectedEvidence(null);
    setInspectorOpen(false);
    router.push(`/projects/${projectId}/ask`);
  };

  // Select a claim to inspect: Opens Inspector
  const handleSelectClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setSelectedEvidence(null);
    setInspectorOpen(true);
  };

  // Select an evidence chunk to inspect: Opens Inspector
  const handleSelectEvidence = (ev: EvidenceItem) => {
    setSelectedEvidence(ev);
    setInspectorOpen(true);
  };

  const isHeroState = !activeConversationId && messages.length === 0;

  // Auto-scroll messages container to bottom on update
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSubmitting]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
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
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-background">
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
            <div className="px-4 py-2.5 border-b border-border/50 bg-card/30 flex items-center justify-between select-none shrink-0">
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

              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="hidden sm:inline">
                    {readyDocuments.length} ready {readyDocuments.length === 1 ? 'doc' : 'docs'}
                  </span>
                </div>

                {/* Subtle Inspector Toggle if a claim was selected */}
                {selectedClaim && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInspectorOpen(!inspectorOpen)}
                    className="h-7 text-xs gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                    title={inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                  >
                    {inspectorOpen ? (
                      <PanelRightClose className="h-3.5 w-3.5" />
                    ) : (
                      <PanelRightOpen className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden md:inline">Inspector</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Transcript Messages Scroll Area: Centered Reading Column */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
              <div className="max-w-[760px] mx-auto w-full space-y-6">
                {messages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  const assistantClaims = msg.generationId ? generationClaimsMap[msg.generationId] || [] : [];

                  if (isUser) {
                    return (
                      <div
                        key={msg.id || index}
                        className="space-y-1.5 pt-3 pb-2 border-b border-border/20"
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

                  // Assistant Response Area
                  return (
                    <div key={msg.id || index} className="space-y-2 pb-6">
                      <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        <span>GROUNDGUARD</span>
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
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground pl-1 flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span>Thinking & verifying against project knowledge...</span>
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
            </div>

            {/* Persistent Compact Bottom Composer: Centered Column */}
            <div className="p-3 sm:p-4 border-t border-border/60 bg-background/95 backdrop-blur-sm shrink-0">
              <div className="max-w-[760px] mx-auto w-full">
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
          </div>
        )}
      </div>

      {/* 3. Right Contextual Inspector: Opened ONLY when a claim/evidence is selected */}
      <AskInspector
        claim={selectedClaim}
        selectedEvidence={selectedEvidence}
        projectId={projectId}
        isOpen={inspectorOpen && Boolean(selectedClaim)}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
