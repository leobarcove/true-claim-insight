import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

/**
 * Arrange the assessment, and tell the claimant.
 *
 * The router has decided *how* a claim is examined since 6 August; nothing set
 * *when*. `scheduledAssessmentTime` was read in three places and written by
 * nobody, so the diary was empty and a property claimant learned an adjuster
 * was coming when one arrived at the door.
 *
 * The button says what actually happens. "Schedule" would hide the half that
 * matters to the person on the other end.
 */
export function ScheduleAssessment({
  claimId,
  mode,
  scheduledFor,
  onScheduled,
}: {
  claimId?: string;
  mode?: string | null;
  scheduledFor?: string | null;
  onScheduled?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);

  // Only the modes where someone is actually met. A desk review has no
  // appointment, and an expert referral leaves the firm.
  if (!claimId || (mode !== 'SITE_VISIT' && mode !== 'VIDEO')) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/claims/${claimId}/appointment`, {
        scheduledFor: new Date(when).toISOString(),
      });
      toast({
        title: 'Assessment arranged',
        description: 'The claimant has been told the date and time.',
      });
      setOpen(false);
      setWhen('');
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      onScheduled?.();
    } catch (error: any) {
      toast({
        title: 'Not arranged',
        description:
          error?.response?.data?.error?.message ?? error?.response?.data?.message ?? error?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const arranged = scheduledFor ? new Date(scheduledFor) : null;

  if (!open) {
    return (
      <div className="space-y-1">
        {arranged && (
          <p className="text-xs text-muted-foreground">
            Arranged for{' '}
            {arranged.toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          {arranged ? 'Rearrange and notify' : 'Arrange and notify claimant'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        type="datetime-local"
        value={when}
        onChange={event => setWhen(event.target.value)}
        className="h-9"
      />
      <p className="text-[11px] text-muted-foreground">
        {mode === 'SITE_VISIT'
          ? 'The claimant is told the date, time and address, and asked to have someone there.'
          : 'The claimant is told the date and time, and that a link follows.'}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !when}>
          {saving ? 'Arranging…' : 'Arrange and notify'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setWhen('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
