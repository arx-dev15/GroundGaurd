/**
 * Pure "stick to bottom" state transitions for the Ask transcript (ChatGPT-style).
 *
 * - The view follows new output only while the user is at (or near) the bottom.
 * - Scrolling UP is the only thing that stops following; content growth and programmatic smooth scrolls never do,
 *   so a smooth scroll-to-bottom animation cannot accidentally disable following mid-way.
 * - The jump button shows when the user is meaningfully far from the bottom, and flags unseen new content.
 */

export const FOLLOW_THRESHOLD_PX = 96;
export const BUTTON_THRESHOLD_PX = 220;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface FollowState {
  following: boolean;
  showJumpButton: boolean;
  hasUnseenBelow: boolean;
  lastScrollTop: number;
}

export const initialFollowState: FollowState = { following: true, showJumpButton: false, hasUnseenBelow: false, lastScrollTop: 0 };

export function distanceToBottom(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight);
}

/** Transition on a scroll event. */
export function onScrollEvent(prev: FollowState, m: ScrollMetrics): FollowState {
  const dist = distanceToBottom(m);
  const scrolledUp = m.scrollTop < prev.lastScrollTop - 2;
  let following = prev.following;
  if (dist <= FOLLOW_THRESHOLD_PX) following = true;
  else if (scrolledUp) following = false;
  const showJumpButton = dist > BUTTON_THRESHOLD_PX;
  return {
    following,
    showJumpButton,
    hasUnseenBelow: showJumpButton ? prev.hasUnseenBelow : false,
    lastScrollTop: m.scrollTop,
  };
}

/** Transition when the transcript content grows. Returns whether the view should be pinned to the bottom. */
export function onContentGrowth(prev: FollowState, m: ScrollMetrics): { state: FollowState; pinToBottom: boolean } {
  if (prev.following) return { state: { ...prev, showJumpButton: false, hasUnseenBelow: false }, pinToBottom: true };
  const far = distanceToBottom(m) > BUTTON_THRESHOLD_PX;
  return { state: { ...prev, showJumpButton: far, hasUnseenBelow: far || prev.hasUnseenBelow }, pinToBottom: false };
}

/** Transition when the user explicitly asks to go to the latest message (button, or submitting a new question). */
export function onJumpToBottom(prev: FollowState): FollowState {
  return { ...prev, following: true, showJumpButton: false, hasUnseenBelow: false };
}
