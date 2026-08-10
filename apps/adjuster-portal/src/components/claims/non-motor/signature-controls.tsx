/**
 * Inline signature lifecycle controls for a single Document row.
 * Renders a status badge + the relevant action button(s):
 *
 *   NOT_REQUESTED → [Request signature]
 *   PENDING       → 🟡 Pending • [Mark signed (demo)] [Cancel]
 *   SIGNED        → 🟢 Signed (no actions, signed copy linked)
 *   CANCELLED/EXPIRED → grey badge (no actions)
 *
 * The "Mark signed (demo)" button stands in for the SigningCloud
 * webhook callback — in production that endpoint is invoked by the
 * vendor when the claimant completes signing on their phone.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  PenLine,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCancelSignature,
  useCompleteSignature,
  useRequestSignature,
} from '@/hooks/use-signatures';

type SignatureStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'SIGNED'
  | 'EXPIRED'
  | 'CANCELLED';

interface DocLike {
  id: string;
  signatureStatus?: SignatureStatus | null;
  signedAt?: string | null;
  signedStorageUrl?: string | null;
}

interface Props {
  doc: DocLike;
  claimId: string;
  /**
   * If true, show the [Request signature] button on docs in
   * NOT_REQUESTED state. Use this for document types that are meant to
   * be signed (e.g. SIGNED_STATEMENT). For photos/receipts, omit so the
   * row stays clean.
   */
  canRequest?: boolean;
}

export function SignatureControls({ doc, claimId, canRequest }: Props) {
  const status = (doc.signatureStatus ?? 'NOT_REQUESTED') as SignatureStatus;
  const request = useRequestSignature(claimId);
  const complete = useCompleteSignature(claimId);
  const cancel = useCancelSignature(claimId);

  const anyPending =
    request.isPending || complete.isPending || cancel.isPending;

  if (status === 'SIGNED') {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1 h-5"
      >
        <CircleCheck className="h-3 w-3" />
        Signed
      </Badge>
    );
  }

  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className="border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 gap-1 h-5"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Awaiting signature
        </Badge>
        <InfoTooltip
          content="Mark as signed (demo — stands in for the vendor webhook)"
          direction="top"
          fontSize="text-[11px]"
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              onClick={() => complete.mutate(doc.id)}
              disabled={anyPending}
            >
              {complete.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleCheck className="h-3.5 w-3.5" />
              )}
            </Button>
          }
        />
        <InfoTooltip
          content="Cancel signing request"
          direction="top"
          fontSize="text-[11px]"
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => cancel.mutate(doc.id)}
              disabled={anyPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          }
        />
      </div>
    );
  }

  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1 h-5 text-muted-foreground',
          status === 'EXPIRED' && 'border-amber-200'
        )}
      >
        <CircleAlert className="h-3 w-3" />
        {status === 'CANCELLED' ? 'Signing cancelled' : 'Signing expired'}
        {canRequest && (
          <InfoTooltip
            content="Re-request signature"
            direction="top"
            fontSize="text-[11px]"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-1 text-muted-foreground hover:text-primary"
                onClick={e => {
                  e.stopPropagation();
                  request.mutate(doc.id);
                }}
                disabled={anyPending}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            }
          />
        )}
      </Badge>
    );
  }

  // NOT_REQUESTED — only show the request button for signable doc types.
  if (!canRequest) return null;
  return (
    <InfoTooltip
      content="Request claimant signature"
      direction="top"
      fontSize="text-[11px]"
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 gap-1 text-xs"
          onClick={() => request.mutate(doc.id)}
          disabled={anyPending}
        >
          {request.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PenLine className="h-3 w-3" />
          )}
          Request signature
        </Button>
      }
    />
  );
}
