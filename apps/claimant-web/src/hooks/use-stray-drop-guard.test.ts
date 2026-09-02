import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useStrayDropGuard } from './use-stray-drop-guard';

/**
 * The default action for a file dropped on a page is to open it, replacing the
 * form. On a screen that asks people to drag files in, a near miss is ordinary
 * — so the guard is what makes the invitation safe to accept.
 */

const fileDrag = (type: string, types: string[]) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types } });
  return event;
};

describe('a file dropped anywhere but a drop zone', () => {
  it('does nothing at all, rather than navigating away from the form', () => {
    renderHook(() => useStrayDropGuard());

    const dropped = fileDrag('drop', ['Files']);
    window.dispatchEvent(dropped);

    expect(dropped.defaultPrevented).toBe(true);
  });

  it('also swallows the dragover, without which the drop never fires', () => {
    renderHook(() => useStrayDropGuard());

    const over = fileDrag('dragover', ['Files']);
    window.dispatchEvent(over);

    expect(over.defaultPrevented).toBe(true);
  });

  /**
   * Dragging within the page is somebody rearranging selected text in an
   * answer. Swallowing that would break editing to fix uploading.
   */
  it('leaves a drag that is not carrying files alone', () => {
    renderHook(() => useStrayDropGuard());

    const text = fileDrag('drop', ['text/plain']);
    window.dispatchEvent(text);

    expect(text.defaultPrevented).toBe(false);
  });

  it('stops listening once the form is gone', () => {
    const { unmount } = renderHook(() => useStrayDropGuard());
    unmount();

    const after = fileDrag('drop', ['Files']);
    window.dispatchEvent(after);

    expect(after.defaultPrevented).toBe(false);
  });
});
