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
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useShell } from '@/components/layout/shell-context';
import { useAuth } from '@/lib/auth-context';
import { useGenerationEvents } from '@/lib/use-generation-events';
import { Button } from '@/components/ui/button';
import { AskComposer } from '@/components/ask/ask-composer';
import { ZeroKnowledgeState } from '@/components/ask/zero-knowledge-state';
import { AnswerView } from '@/components/ask/answer-view';
import { AskInspector } from '@/components/ask/ask-inspector';
import { GroundGuardAnalysis } from '@/components/ask/groundguard-analysis';
import { ConversationSidebar } from '@/components/ask/conversation-sidebar';
import { useProjectDocuments } from '@/lib/documents-query';
import {
  useProjectConversations,
  useConversationMessages,
  useCreateConversation,
  conversationQueryKeys,
} from '@/lib/conversations-query';
import { apiClient, GroundGuardAPIError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Project, Conversation, Message, Claim, EvidenceItem } from '@groundguard/types';

interface GenerationErrorState {
  message: string;
  code?: string;
  requestId?: string;
  queryText: string;
}

export default function AskPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  const { currentProject } = useShell();
  const { user } = useAuth();

  const [isStackDegraded, setIsStackDegraded] = React.useState(false);

  const checkReadiness = React.useCallback(async () => {
    try {
      const res = await apiClient.get<any>('/health/readiness');
      if (res?.status === 'degraded' || res?.status === 'error') {
        setIsStackDegraded(true);
      } else {
        setIsStackDegraded(false);
      }
    } catch {
      setIsStackDegraded(true);
    }
  }, []);

  React.useEffect(() => {
    checkReadiness();
    const interval = setInterval(checkReadiness, 15000);
    return () => clearInterval(interval);
  }, [checkReadiness]);

  const projectId = (params?.projectId as string) || '';
  const convParam = searchParams.get('c');

  // Documents data to check ready knowledge
  const { data: documents = [], isLoading: isLoadingDocs } = useProjectDocuments(projectId);
  const readyDocuments = documents.filter((d) => d.status === 'ready');
  const hasReadyKnowledge = readyDocuments.length > 0;

  // Conversations query — ALWAYS fetched on mount, independent of active conversation or message mutation
  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    refetch: refetchConversations,
  } = useProjectConversations(projectId);

  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(convParam || null);

  // Sync activeConversationId with URL query parameter
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

  // Error state for generation failure
  const [generationError, setGenerationError] = React.useState<GenerationErrorState | null>(null);
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);

  // Composer input state
  const [inputValue, setInputValue] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Inspector state: CLOSED by default
  const [selectedClaim, setSelectedClaim] = React.useState<Claim | null>(null);
  const [selectedEvidence, setSelectedEvidence] = React.useState<EvidenceItem | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [inspectorInitialTab, setInspectorInitialTab] = React.useState<string>('claim');

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

  // In-flight generation tracking & meaningful stages
  const [activeGenerationId, setActiveGenerationId] = React.useState<string | null>(null);
  const [statusLabel, setStatusLabel] = React.useState<string>('Retrieving project evidence...');
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // SSE runtime events subscription for live verification updates
  const { cancel: cancelGenerationEvents } = useGenerationEvents({
    generationId: activeGenerationId,
    enabled: Boolean(activeGenerationId && isSubmitting),
    onEvent: (event) => {
      if (event === 'generation.started') {
        setStatusLabel('Generating grounded answer...');
      } else if (event === 'sentence.verified' || event === 'sentence.flagged') {
        setStatusLabel('Verifying claims against project knowledge...');
      } else if (event === 'recovery.started') {
        setStatusLabel('Recovering unsupported claims...');
      } else if (event === 'recovery.completed') {
        setStatusLabel('Finalizing answer...');
      }
    },
    onClaimUpdate: (claim) => {
      if (activeGenerationId) {
        setGenerationClaimsMap((prev) => {
          const list = prev[activeGenerationId] || [];
          const idx = list.findIndex((c) => c.claimId === claim.claimId);
          if (idx >= 0) {
            const nextList = [...list];
            nextList[idx] = claim;
            return { ...prev, [activeGenerationId]: nextList };
          }
          return { ...prev, [activeGenerationId]: [...list, claim] };
        });
      }
    },
    onCancelled: () => {
      setIsSubmitting(false);
      setActiveGenerationId(null);
    },
  });

  // Cancel generation handler
  const handleCancel = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeGenerationId) {
      await cancelGenerationEvents();
    }
    setIsSubmitting(false);

    if (activeConversationId) {
      const cancelMsg: Message = {
        id: `cancelled-${Date.now()}`,
        conversationId: activeConversationId,
        role: 'assistant',
        content: 'Generation cancelled by user.',
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Message[]>(
        conversationQueryKeys.messages(activeConversationId),
        (old = []) => [...old, cancelMsg]
      );
    }
    setPendingUserMessage(null);
    setActiveGenerationId(null);
  };

  // Submit Handler
  const handleSubmit = async (overrideText?: string) => {
    const textToSend = (overrideText ?? inputValue).trim();
    if (!textToSend || isSubmitting) return;

    setGenerationError(null);
    setShowErrorDetails(false);

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId || 'pending',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setPendingUserMessage(tempMsg);
    setInputValue('');
    setTimeout(() => {
      const textarea = document.querySelector('textarea');
      textarea?.focus();
    }, 20);
    setIsSubmitting(true);
    setStatusLabel('Retrieving project evidence...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let targetConvId = activeConversationId;

      // 1. If no active conversation, create one first
      if (!targetConvId) {
        const titleSnippet = textToSend.slice(0, 48);
        const newConv = await createConversationMutation.mutateAsync(titleSnippet);
        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);
        router.replace(`/projects/${projectId}/ask?c=${newConv.id}`);
      }

      setStatusLabel('Generating grounded answer...');

      // 2. Send query message to M3
      const res = await apiClient.post<any>(
        `/v1/projects/${projectId}/conversations/${targetConvId}/messages`,
        { content: textToSend },
        { signal: controller.signal }
      );

      // Track active generation ID
      if (res?.generationId) {
        setActiveGenerationId(res.generationId);
      }

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

      // Check if generation returned a failed status
      if (res?.status === 'failed') {
        setGenerationError({
          message: res?.error?.message || "We couldn't generate this answer.",
          code: res?.error?.code || 'GENERATION_FAILED',
          requestId: res?.requestId,
          queryText: textToSend,
        });
      }

      // 3. Update TanStack query cache directly for instantaneous display
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

      setPendingUserMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.messages(targetConvId) }),
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.projectList(projectId) }),
      ]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to send message:', err);
      setPendingUserMessage(null);

      const isApiErr = err instanceof GroundGuardAPIError;
      setGenerationError({
        message: err?.message || "We couldn't generate this answer.",
        code: isApiErr ? err.code : 'REQUEST_ERROR',
        requestId: isApiErr ? err.requestId : undefined,
        queryText: textToSend,
      });
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
      setTimeout(() => {
        const textarea = document.querySelector('textarea');
        textarea?.focus();
      }, 50);
    }
  };

  // Switch to new conversation state
  const handleNewConversation = () => {
    setActiveConversationId(null);
    setPendingUserMessage(null);
    setGenerationError(null);
    setSelectedClaim(null);
    setSelectedEvidence(null);
    setInspectorOpen(false);
    router.push(`/projects/${projectId}/ask`);
  };

  // Select a claim to inspect (synchronizes claim ↔ evidence ↔ PDF)
  const handleSelectClaim = (claim: Claim, tab = 'claim') => {
    setSelectedClaim(claim);
    if (claim.evidence && claim.evidence.length > 0) {
      setSelectedEvidence(claim.evidence[0]);
    }
    setInspectorInitialTab(tab);
    setInspectorOpen(true);
  };

  // Select an evidence chunk/citation to inspect (opens PDF directly beside answer)
  const handleSelectEvidence = (ev: EvidenceItem) => {
    setSelectedEvidence(ev);
    const matchingClaim = Object.values(generationClaimsMap).flat().find((c) =>
      (c.evidence || []).some((e) => (e.chunkId || e.text) === (ev.chunkId || ev.text))
    );
    if (matchingClaim) {
      setSelectedClaim(matchingClaim);
    }
    setInspectorInitialTab('source');
    setInspectorOpen(true);
  };

  // Keyboard navigation: Up/Down arrow through claims, Esc to close inspector
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectorOpen) {
        setInspectorOpen(false);
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selectedClaim) {
        const activeGenClaims = Object.values(generationClaimsMap).find((claims) =>
          claims.some((c) => c.claimId === selectedClaim.claimId)
        );
        if (activeGenClaims && activeGenClaims.length > 1) {
          const currIdx = activeGenClaims.findIndex((c) => c.claimId === selectedClaim.claimId);
          if (e.key === 'ArrowDown' && currIdx < activeGenClaims.length - 1) {
            e.preventDefault();
            handleSelectClaim(activeGenClaims[currIdx + 1]);
          } else if (e.key === 'ArrowUp' && currIdx > 0) {
            e.preventDefault();
            handleSelectClaim(activeGenClaims[currIdx - 1]);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectorOpen, selectedClaim, generationClaimsMap]);

  const cleanMessages = React.useMemo(() => {
    return messages.filter((m) => {
      if (m.role === 'assistant') {
        const c = m.content.toLowerCase();
        if (
          c.includes('evidex ai was unable to complete grounded verification') ||
          c.includes('groundguard was unable to complete grounded verification') ||
          c.includes('generation service unavailable') ||
          c.includes('service is temporarily unreachable')
        ) {
          return false;
        }
      }
      return true;
    });
  }, [messages]);

  const isHeroState = !activeConversationId || cleanMessages.length === 0;

  const displayName = user?.name || (user as any)?.displayName || null;
  const projectName = currentProject?.name || 'this project';
  const greetingHeading = displayName
    ? `Hey, ${displayName} — what do you want to verify in ${projectName}?`
    : `Welcome back. What do you want to explore in ${projectName}?`;

  const docNames = readyDocuments.slice(0, 2).map((d) => d.filename);
  let greetingSub = `${readyDocuments.length} project ${readyDocuments.length === 1 ? 'document is' : 'documents are'} ready for grounded questions.`;
  if (docNames.length > 0 && docNames.length <= 2) {
    greetingSub = `${docNames.join(' and ')} ${docNames.length === 1 ? 'is' : 'are'} ready.`;
  }

  // Auto-scroll messages container to bottom on update
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cleanMessages.length, isSubmitting, generationError]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* 1. Left Conversation History Sidebar — ALWAYS PERSISTENT ON DESKTOP */}
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoading={isLoadingConversations}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          router.push(`/projects/${projectId}/ask?c=${id}`);
        }}
        onNewConversation={handleNewConversation}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden md:flex"
      />

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
          // NEW CONVERSATION STATE (Personalized Hero Entry Experience)
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
                {greetingHeading}
              </h1>

              <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                {readyDocuments.length > 0
                  ? greetingSub
                  : 'EvideX AI answers from evidence in this project once documents are uploaded.'}
              </p>

              <div className="text-[11px] text-muted-foreground/75 font-mono">
                Ask a question, compare sources, verify a claim, or trace the evidence.
              </div>
            </motion.div>

            {/* Degraded service notice if AI/ML stack unavailable */}
            {isStackDegraded && (
              <div className="w-full max-w-xl mb-4 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>EvideX AI is temporarily unavailable for new answers.</span>
                </div>
                <Button variant="ghost" size="sm" onClick={checkReadiness} className="h-6 text-[11px] px-2">
                  Check again
                </Button>
              </div>
            )}

            {/* Dominant Hero Composer */}
            <AskComposer
              mode="hero"
              value={inputValue}
              onChange={setInputValue}
              onSubmit={() => handleSubmit()}
              isLoading={isSubmitting}
              readyDocuments={readyDocuments}
              disabled={isStackDegraded}
              onSelectExample={(text) => {
                setInputValue(text);
                handleSubmit(text);
              }}
            />
          </div>
        ) : (
          // ============================================================
          // ACTIVE CONVERSATION STATE (GroundGuard Reading & Verification)
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



                {cleanMessages.map((msg, index) => {
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
                        <span>EvideX AI</span>
                      </div>

                      <AnswerView
                        answerText={msg.content}
                        claims={assistantClaims}
                        generationStatus={msg.content.includes('cancelled') ? 'cancelled' : 'completed'}
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

                {/* In-flight Generating Indicator with Cancel Action */}
                {isSubmitting && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground pl-1">
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>{statusLabel}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancel}
                        className="h-6 text-[11px] gap-1 px-2 border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <XCircle className="h-3 w-3" />
                        <span>Cancel</span>
                      </Button>
                    </div>
                    <GroundGuardAnalysis
                      mode="live"
                      currentStage={statusLabel}
                    />
                  </div>
                )}

                {/* Inline Generation Error Experience with Retry Action */}
                {generationError && !isSubmitting && (
                  <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <h4 className="text-sm font-semibold text-foreground">
                          EvideX AI can&apos;t generate a grounded answer right now.
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Your question is safe. Try again in a moment.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSubmit(generationError.queryText)}
                        className="h-7 text-xs font-medium gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Try again</span>
                      </Button>

                      {(generationError.code || generationError.requestId) && (
                        <button
                          type="button"
                          onClick={() => setShowErrorDetails(!showErrorDetails)}
                          className="text-[11px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                        >
                          <span>{showErrorDetails ? 'Hide advanced details' : 'Advanced details'}</span>
                          {showErrorDetails ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>

                    {showErrorDetails && (
                      <div className="p-2.5 rounded-lg bg-background/80 border border-border/60 text-[11px] font-mono space-y-1 text-muted-foreground">
                        {generationError.code && (
                          <div>
                            <span className="text-foreground">Error Code:</span> {generationError.code}
                          </div>
                        )}
                        {generationError.requestId && (
                          <div>
                            <span className="text-foreground">Request ID:</span> {generationError.requestId}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Persistent Compact Bottom Composer */}
            <div className="p-3 sm:p-4 border-t border-border/60 bg-background/95 backdrop-blur-sm shrink-0">
              <div className="max-w-[760px] mx-auto w-full space-y-2">
                {isStackDegraded && (
                  <div className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>EvideX AI is temporarily unavailable for new answers.</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={checkReadiness} className="h-6 text-[11px] px-2">
                      Check again
                    </Button>
                  </div>
                )}
                <AskComposer
                  mode="compact"
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={() => handleSubmit()}
                  isLoading={isSubmitting}
                  readyDocuments={readyDocuments}
                  disabled={isStackDegraded}
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
        initialTab={inspectorInitialTab}
        generationId={
          selectedClaim
            ? Object.entries(generationClaimsMap).find(([_, claims]) =>
                claims.some((c) => c.claimId === selectedClaim.claimId)
              )?.[0]
            : undefined
        }
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        onClaimUpdated={(updatedClaim) => {
          setSelectedClaim(updatedClaim);
          setGenerationClaimsMap((prev) => {
            const next = { ...prev };
            for (const [genId, list] of Object.entries(next)) {
              const idx = list.findIndex((c) => c.claimId === updatedClaim.claimId);
              if (idx >= 0) {
                const nextList = [...list];
                nextList[idx] = updatedClaim;
                next[genId] = nextList;
                break;
              }
            }
            return next;
          });
        }}
      />
    </div>
  );
}
