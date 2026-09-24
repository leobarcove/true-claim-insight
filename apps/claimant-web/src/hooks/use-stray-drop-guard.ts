import { useEffect } from 'react';

/**
 * Stop a missed file-drop from throwing the form away.
 *
 * A browser's default action for a file dropped on a page is to *navigate to
 * it* — the form is replaced by a JPEG, and everything typed since the last
 * saved step is gone. That is the ordinary outcome of aiming slightly wrong on
 * a page that invites dragging, so the invitation has to come with this.
 *
 * The drop zones themselves call `preventDefault` and stop propagation, so they
 * never reach this; anything that does is by definition a miss, and a miss
 * should do nothing at all.
 */
export function useStrayDropGuard() {
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      // Only files. Dragging selected text around a page is somebody editing an
      // answer, and breaking that would be a worse bug than the one this fixes.
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
    };

    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);
}
