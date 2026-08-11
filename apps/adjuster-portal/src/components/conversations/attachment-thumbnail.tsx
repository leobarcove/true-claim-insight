import { useEffect, useState } from 'react';
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
}: {
  attachment: { id: string; caseId: string; fileName: string; mimeType: string | null };
  onOpen: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = Boolean(attachment.mimeType?.startsWith('image/'));

  useEffect(() => {
    if (!isImage) return;
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
  }, [attachment.caseId, attachment.id, isImage]);

  // Anything that is not an image, or would not load, stays a named link
  // rather than a broken frame — the filename is still information.
  if (!isImage || failed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1.5 text-sm underline underline-offset-2"
      >
        <FileText className="h-3.5 w-3.5" />
        {attachment.fileName}
      </button>
    );
  }

  if (!objectUrl) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading attachment…
      </span>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="block">
      <img
        src={objectUrl}
        alt={attachment.fileName}
        className="max-h-48 max-w-[220px] rounded border border-border object-cover"
      />
    </button>
  );
}
