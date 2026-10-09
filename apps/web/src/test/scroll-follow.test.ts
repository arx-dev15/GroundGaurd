import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialFollowState,
  onScrollEvent,
  onContentGrowth,
  onJumpToBottom,
  BUTTON_THRESHOLD_PX,
} from '../lib/scroll-follow.ts';

const at = (scrollTop: number, scrollHeight = 5000, clientHeight = 800) => ({ scrollTop, scrollHeight, clientHeight });

test('follows streaming output while at the bottom', () => {
  const s = onScrollEvent(initialFollowState, at(4200));
  const g = onContentGrowth(s, at(4200, 5300));
  assert.equal(g.pinToBottom, true);
  assert.equal(g.state.showJumpButton, false);
});

test('scrolling up stops following; growth then never forces the user down and flags unseen content', () => {
  let s = onScrollEvent(initialFollowState, at(4200));
  s = onScrollEvent(s, at(3000)); // user scrolls up to read
  assert.equal(s.following, false);
  assert.equal(s.showJumpButton, true);
  const g = onContentGrowth(s, at(3000, 5600));
  assert.equal(g.pinToBottom, false);
  assert.equal(g.state.hasUnseenBelow, true);
  assert.equal(g.state.showJumpButton, true);
});

test('a programmatic smooth scroll downward never disables following midway', () => {
  let s = onJumpToBottom(onScrollEvent(onScrollEvent(initialFollowState, at(4200)), at(1000)));
  for (const top of [1400, 2200, 3100, 3900]) s = onScrollEvent(s, at(top)); // animation frames, still far
  assert.equal(s.following, true);
  s = onScrollEvent(s, at(4200));
  assert.equal(s.showJumpButton, false);
  assert.equal(s.hasUnseenBelow, false);
});

test('button hides near the bottom and reappears only when meaningfully far', () => {
  let s = onScrollEvent(initialFollowState, at(4200));
  s = onScrollEvent(s, at(5000 - 800 - (BUTTON_THRESHOLD_PX - 10)));
  assert.equal(s.showJumpButton, false); // small nudge up: no flicker
  s = onScrollEvent(s, at(5000 - 800 - (BUTTON_THRESHOLD_PX + 50)));
  assert.equal(s.showJumpButton, true);
});

test('returning to the bottom manually resumes following', () => {
  let s = onScrollEvent(onScrollEvent(initialFollowState, at(4200)), at(2000));
  assert.equal(s.following, false);
  s = onScrollEvent(s, at(4150));
  assert.equal(s.following, true);
});
