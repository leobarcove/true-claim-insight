import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClaimSla, type SlaClock, type SlaClockState } from '@/hooks/use-sla';

const STAGE_LABELS: Record<string, string> = {
  ACK_TO_INSURER: 'Acknowledge to insurer',
  PRELIMINARY_REPORT: 'Preliminary report',
  FINAL_REPORT: 'Final report',
  SUPPLEMENTARY_CLAIM: 'Supplementary claim',
  INSURER_DECISION: 'Insurer decision',
  INSURER_PAYMENT: 'Insurer payment',
};

const STATE_STYLE: Record<SlaClockState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' }> = {
  RUNNING: { label: 'Running', variant: 'default' },
  PAUSED: { label: 'Paused', variant: 'secondary' },
  MET: { label: 'Met', variant: 'success' },
  BREACHED: { label: 'Breached', variant: 'destructive' },
};

const StateIcon = ({ state }: { state: SlaClockState }) => {
  if (state === 'BREACHED') return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  if (state === 'PAUSED') return <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  if (state === 'MET') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
};

const workingDaysBetween = (from: Date, to: Date): number => {
  const forward = to >= from;
  const [start, end] = forward ? [from, to] : [to, from];
  const cursor = new Date(start);
  let days = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return forward ? days : -days;
};

/**
 * How the clock reads to the person working the file.
 *
 * A paused clock shows the days it banked rather than a date, because the
 * deadline is recomputed from whenever it resumes — printing the old date
 * would state a due date that no longer applies.
 */
function position(clock: SlaClock): string {
  if (clock.state === 'PAUSED') {
    const banked = clock.remainingWorkingDaysAtPause;
    const reason = clock.pauseReason ? ` — ${clock.pauseReason.toLowerCase()}` : '';
    return banked === null
      ? `Paused${reason}`
      : `${banked} working day${banked === 1 ? '' : 's'} banked${reason}`;
  }

  const due = new Date(clock.dueAt);
  if (clock.state === 'MET') {
    return `Met, due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }

  if (clock.state === 'BREACHED') {
    // Missing the deadline and still owing the work are different states, and
    // an insurer asks about the difference first. A discharged breach says when
    // it was delivered; a live one keeps counting.
    if (clock.stoppedAt) {
      const late = Math.abs(workingDaysBetween(new Date(clock.stoppedAt), due));
      return `Delivered ${late} working day${late === 1 ? '' : 's'} late`;
    }
    const overdue = Math.abs(workingDaysBetween(new Date(), due));
    return `${overdue} working day${overdue === 1 ? '' : 's'} overdue, still outstanding`;
  }

  const days = workingDaysBetween(new Date(), due);
  if (days < 0) {
    const late = Math.abs(days);
    return `${late} working day${late === 1 ? '' : 's'} overdue`;
  }
  if (days === 0) return 'Due today';
  return `${days} working day${days === 1 ? '' : 's'} left`;
}

/**
 * The CSP clocks on a claim.
 *
 * Firm-side stages are the firm's own obligations. Insurer-side stages are
 * marked as such: the firm measures them so it can evidence where a delay
 * began, but a breach there is not the firm's failing and must never read as
 * one (MASTER_PLAN §3.2).
 */
export function SlaPanel({ claimId }: { claimId?: string }) {
  const { data: clocks, isLoading } = useClaimSla(claimId);

  if (isLoading) return null;
  if (!clocks?.length) return null;

  const firmSide = clocks.filter(c => !c.policy.monitorOnly);
  const insurerSide = clocks.filter(c => c.policy.monitorOnly);

  const row = (clock: SlaClock) => {
    const style = STATE_STYLE[clock.state];
    return (
      <div key={clock.id} className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <StateIcon state={clock.state} />
            {STAGE_LABELS[clock.stage] ?? clock.stage}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {position(clock)} · {clock.policy.workingDays} working day target
          </p>
        </div>
        <Badge variant={style.variant} className="shrink-0">
          {style.label}
        </Badge>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Turnaround
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">{firmSide.map(row)}</div>

        {insurerSide.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Insurer side — measured, not ours
            </p>
            <div className="divide-y">{insurerSide.map(row)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
