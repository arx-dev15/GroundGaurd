'use client';

import * as React from 'react';
import {
  initialFollowState,
  onContentGrowth,
  onJumpToBottom,
  onScrollEvent,
  type FollowState,
} from './scroll-follow';

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Stick-to-bottom behaviour for a scroll container whose content element grows (streamed answers, claims,
 * evidence panels). Scrolls only the given container — never the page.
 */
export function useStickToBottom<C extends HTMLElement, T extends HTMLElement>() {
  const containerRef = React.useRef<C | null>(null);
  // The transcript may mount later (e.g. after the first message), so observe it via a callback ref.
  const [contentEl, setContentEl] = React.useState<T | null>(null);
  const contentRef = React.useCallback((el: T | null) => setContentEl(el), []);
  const stateRef = React.useRef<FollowState>(initialFollowState);
  const [view, setView] = React.useState({ showJumpButton: false, hasUnseenBelow: false });

  const publish = React.useCallback((next: FollowState) => {
    stateRef.current = next;
    setView((v) =>
      v.showJumpButton === next.showJumpButton && v.hasUnseenBelow === next.hasUnseenBelow
        ? v
        : { showJumpButton: next.showJumpButton, hasUnseenBelow: next.hasUnseenBelow }
    );
  }, []);

  const metrics = () => {
    const el = containerRef.current!;
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  };

  const onScroll = React.useCallback(() => {
    if (!containerRef.current) return;
    publish(onScrollEvent(stateRef.current, metrics()));
  }, [publish]);

  const scrollToBottom = React.useCallback(
    (behavior: 'smooth' | 'auto' = 'smooth') => {
      const el = containerRef.current;
      if (!el) return;
      publish(onJumpToBottom(stateRef.current));
      el.scrollTo({ top: el.scrollHeight, behavior: behavior === 'smooth' && !reducedMotion() ? 'smooth' : 'auto' });
    },
    [publish]
  );

  // Follow content growth (streaming text, claims, panels) only while the user is following.
  React.useEffect(() => {
    const el = containerRef.current;
    const content = contentEl;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    let lastHeight = content.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const h = content.getBoundingClientRect().height;
      const grew = h > lastHeight + 0.5;
      lastHeight = h;
      if (!grew) return;
      const { state, pinToBottom } = onContentGrowth(stateRef.current, metrics());
      publish({ ...state, lastScrollTop: pinToBottom ? Math.max(0, el.scrollHeight - el.clientHeight) : state.lastScrollTop });
      if (pinToBottom) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [publish, contentEl]);

  return { containerRef, contentRef, onScroll, scrollToBottom, ...view };
}
