import { Receipt } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  useClaimBilling,
  useDraftFeeNote,
  useIssueFeeNote,
  type FeeNoteStatus,
} from '@/hooks/use-billing';
import { useHasPermission, PERMISSIONS } from '@/lib/permissions';

const STATUS_STYLE: Record<
  FeeNoteStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ISSUED: { label: 'Issued', variant: 'default' },
  PAID: { label: 'Paid', variant: 'success' },
  DISPUTED: { label: 'Disputed', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
};

/** Money arrives as a decimal string and is printed as one — never via a float. */
const money = (value: string | number) => {
  const [whole, decimals = '00'] = String(value).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `RM ${grouped}.${decimals.padEnd(2, '0').slice(0, 2)}`;
};

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The fee note — step 8, and the only step that pays for the other seven.
 *
 * The engine has been complete since Phase 1c and was unreachable: no gateway
 * module and no screen, so a firm could adjust a claim and had no way to bill
 * for it. The derivation is shown, not just the total, for the reason the note
 * stores it — the number without its working is unanswerable when the insurer
 * disputes it, and disputes are the one certainty in billing.
 */
export function FeeNotePanel({ claimId }: { claimId?: string }) {
  const { toast } = useToast();
  // Seeing what the firm billed and raising it are different rights, and the
  // server draws the line in the same place: reading is open to anyone who may
  // open the claim — they are already on it — while drafting, issuing and
  // settling are a firm admin's. Gating the *card* on a broader permission hid
  // it from the adjuster who did the work.
  const canBill = useHasPermission(PERMISSIONS.BILLING_MANAGE);
  const { data, isLoading } = useClaimBilling(claimId);
  const draft = useDraftFeeNote(claimId);
  const issue = useIssueFeeNote(claimId);

  if (isLoading || !data) return null;

  const { note, disbursements, blockedReason } = data;

  const onDraft = () =>
    draft.mutate(undefined, {
      onSuccess: () => toast({ title: 'Fee note drafted' }),
      onError: (error: any) =>
        toast({
          title: 'Could not draft the fee note',
          description: error?.response?.data?.error?.message ?? error?.message,
          variant: 'destructive',
        }),
    });

  const onIssue = () =>
    note &&
    issue.mutate(note.id, {
      onSuccess: () => toast({ title: `${note.noteNumber} issued to the insurer` }),
      onError: (error: any) =>
        toast({
          title: 'Could not issue the fee note',
          description: error?.response?.data?.error?.message ?? error?.message,
          variant: 'destructive',
        }),
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-primary" />
          Fee note
          {note && (
            <span className="ml-1 font-mono text-xs text-muted-foreground">{note.noteNumber}</span>
          )}
        </CardTitle>
        {note && (
          <Badge variant={STATUS_STYLE[note.status].variant}>
            {STATUS_STYLE[note.status].label}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!note && (
          <>
            <p className="text-sm text-muted-foreground">
              {blockedReason ?? 'No fee note raised for this claim yet.'}
            </p>
            {!blockedReason && canBill && (
              <Button size="sm" className="w-full" onClick={onDraft} disabled={draft.isPending}>
                {draft.isPending ? 'Drafting…' : 'Draft fee note'}
              </Button>
            )}
          </>
        )}

        {note && (
          <>
            <div className="rounded-lg border bg-muted/30 p-4 font-mono text-sm">
              <div className="flex justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">Professional fee</span>
                <span className="tabular-nums">{money(note.professionalFee)}</span>
              </div>
              {Number(note.disbursementsTotal) > 0 && (
                <div className="flex justify-between gap-4 py-0.5">
                  <span className="text-muted-foreground">
                    Disbursements ({disbursements.length})
                  </span>
                  <span className="tabular-nums">{money(note.disbursementsTotal)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">
                  SST{' '}
                  {note.computation ? `${(note.computation.sstRate * 100).toFixed(0)}%` : ''}
                </span>
                <span className="tabular-nums">{money(note.sstAmount)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(note.total)}</span>
              </div>
            </div>

            {note.computation?.derivation?.length ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  How the fee was reached
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {note.computation.derivation.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {note.status === 'ISSUED' && note.dueAt && (
              <p className="text-xs text-muted-foreground">
                Issued {note.issuedAt ? date(note.issuedAt) : ''} · due {date(note.dueAt)}
              </p>
            )}
            {note.status === 'PAID' && note.paymentReference && (
              <p className="text-xs text-muted-foreground">
                Settled · reference {note.paymentReference}
              </p>
            )}
            {note.status === 'DISPUTED' && note.disputeReason && (
              <p className="text-xs text-destructive">Disputed — {note.disputeReason}</p>
            )}

            {note.status === 'DRAFT' && canBill && (
              <Button size="sm" className="w-full" onClick={onIssue} disabled={issue.isPending}>
                {issue.isPending ? 'Issuing…' : 'Issue to insurer'}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
