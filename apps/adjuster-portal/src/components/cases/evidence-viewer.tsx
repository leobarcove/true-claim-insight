import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

/**
 * Looking at what the claimant actually sent.
 *
 * Case documents were write-only: the portal could upload them and had no way
 * to read one back, so an operator vetting a case saw "3 of 3 documents" and
 * could not open any of them — approving evidence sight unseen, immediately
 * before `convert()` hands the claim to the insurer.
 *
 * Fetched as an authenticated blob rather than pointed at with a bare `src`:
 * the route carries claimant personal data, so it requires the operator's
 * bearer token and is recorded as a sensitive read. A URL that renders without
 * one would be a URL that can be forwarded.
 */
export interface EvidenceDocument {
  id: string;
  fileName: string;
  documentType: string;
  /** Absent on older rows; the viewer then offers a download rather than guessing. */
  mimeType?: string | null;
  supersededAt?: string | null;
}

export function EvidenceViewer({
  caseId,
  document: doc,
  onClose,
}: {
  caseId: string;
  document: EvidenceDocument;
  onClose: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;

    apiClient
      .get(`/cases/${caseId}/documents/${doc.id}/content`, { responseType: 'blob' })
      .then(response => {
        if (revoked) return;
        url = URL.createObjectURL(response.data as Blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!revoked) setError('This document could not be loaded.');
      });

    // Revoked on unmount: an object URL left behind keeps the claimant's
    // document in the tab's memory for as long as it stays open.
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [caseId, doc.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence: ${doc.fileName}`}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-background"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{doc.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {doc.documentType.replace(/_/g, ' ').toLowerCase()}
              {doc.supersededAt ? ' · superseded by a later upload' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {objectUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={objectUrl} download={doc.fileName}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-[240px] items-center justify-center overflow-auto bg-muted/30 p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !objectUrl ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : doc.mimeType?.startsWith('image/') ? (
            <img src={objectUrl} alt={doc.fileName} className="max-h-[70vh] max-w-full" />
          ) : doc.mimeType === 'application/pdf' ? (
            <iframe src={objectUrl} title={doc.fileName} className="h-[70vh] w-full" />
          ) : (
            // Anything the browser must not render in place. Serving it inline
            // would run claimant-supplied markup with an operator's session.
            <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p>This file type cannot be previewed. Download it to open.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
