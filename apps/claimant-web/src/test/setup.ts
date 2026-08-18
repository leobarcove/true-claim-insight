import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Between tests: unmount the tree and empty localStorage.
 *
 * The second matters more than it looks here. The session this app keeps is in
 * localStorage, and `isChannelSession()` reads it directly rather than through
 * React state — so a session left behind by one test silently decides the
 * behaviour of the next, and the suite would pass or fail on file order.
 */
/**
 * jsdom implements no layout, so `scrollIntoView` is simply absent — the chat
 * calls it on every new message to keep the newest question in view. Stubbed
 * here rather than guarded in the component, because the component is right:
 * a conversation that has to be scrolled to be read is one where the claimant
 * misses the question, and that behaviour should not be weakened to suit a
 * test environment.
 */
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
