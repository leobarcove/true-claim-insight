import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

/**
 * The photo a claimant actually sent, in the transcript.
 *
 * Until the case-document read path existed this could only ever say
 * "📎 Attachment": the message row held Telegram's `file_id`, which points at
 * their servers rather than ours. Now it holds the id of the file we stored,
 * so an operator reading the conversation can see the damage photo beside the
 * message that delivered it.
 *
 * Fetched with the operator's token — the route carries claimant personal data
 * and is recorded as a sensitive read.
 */
export function AttachmentThumbnail({
  attachment,
  onOpen,
  variant = 'inline',
}: {
  attachment: { id: string; caseId: string; fileName: string; mimeType: string | null };
  onOpen: () => void;
  /**
   * 'inline' sizes for the transcript, where the image sits inside a message
   * bubble at its own aspect. 'tile' sizes for the evidence gallery, where a
   * grid of mixed portrait screenshots and landscape photos needs one square
   * footprint to read as a collection rather than a jumble.
   */
  variant?: 'inline' | 'tile';
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const holderRef = useRef<HTMLSpanElement>(null);
  const isImage = Boolean(attachment.mimeType?.startsWith('image/'));

  /**
   * Fetch only once the thumbnail is actually on screen.
   *
   * Eagerly loading every attachment in a transcript was wrong three times
   * over. Thirteen simultaneous requests tripped the gateway's rate limit, so
   * some thumbnails silently degraded to a filename. It pulled claimant
   * evidence nobody had asked to see. And each fetch is an *audited sensitive
   * read* — so the trail recorded an operator opening thirteen documents when
   * they had opened none, which is a false record in the one table that
   * cannot be corrected.
   *
   * Loading on visibility makes the audit row true again: what was fetched is
   * what was shown.
   */
  useEffect(() => {
    const holder = holderRef.current;
    if (!isImage || !holder || visible) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // A little ahead of the viewport, so scrolling feels immediate without
      // reaching for images the operator will never arrive at.
      { rootMargin: '200px' }
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [isImage, visible]);

  useEffect(() => {
    if (!isImage || !visible) return;
    let cancelled = false;
    let url: string | null = null;

    apiClient
      .get(`/cases/${attachment.caseId}/documents/${attachment.id}/content`, {
        responseType: 'blob',
      })
      .then(response => {
        if (cancelled) return;
        url = URL.createObjectURL(response.data as Blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.caseId, attachment.id, isImage, visible]);

  // Anything that is not an image, or would not load, stays a named link
  // rather than a broken frame — the filename is still information.
  if (!isImage || failed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={
          variant === 'tile'
            ? 'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded border border-border p-2 text-xs text-muted-foreground'
            : 'flex items-center gap-1.5 text-sm underline underline-offset-2'
        }
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className={variant === 'tile' ? 'w-full truncate text-center' : undefined}>
          {attachment.fileName}
        </span>
      </button>
    );
  }

  if (!objectUrl) {
    // Roughly the footprint the image will occupy. Reserving it keeps the
    // transcript from lurching as blobs arrive at their own pace — the scroll
    // pinning copes either way, but a page that jumps while being read is its
    // own bug. It is also what the IntersectionObserver watches, so it must
    // exist before the image does.
    return (
      <span
        ref={holderRef}
        className={
          variant === 'tile'
            ? 'flex aspect-square w-full items-center justify-center gap-1.5 rounded border border-border text-xs text-muted-foreground'
            : 'flex h-32 w-[220px] items-center justify-center gap-1.5 rounded border border-border text-sm text-muted-foreground'
        }
      >
        {visible && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {visible ? 'Loading…' : ''}
      </span>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={variant === 'tile' ? 'block w-full' : 'block'}>
      <img
        src={objectUrl}
        alt={attachment.fileName}
        className={
          variant === 'tile'
            ? 'aspect-square w-full rounded border border-border object-cover'
            : 'max-h-48 max-w-[220px] rounded border border-border object-cover'
        }
      />
    </button>
  );
}
