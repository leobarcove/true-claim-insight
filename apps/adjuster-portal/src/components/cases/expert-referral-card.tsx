import { useState } from 'react';
import { Stethoscope } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useExpertReferrals, useRecordExpertOutcome } from '@/hooks/use-cases';

/**
 * What the expert was asked, and what they answered.
 *
 * A medical travel case can only convert through an expert, so the opinion is
 * part of the regulated record rather than a note in someone's inbox — PD 12.6
 * asks for the sources behind an assessment. The card shows the outstanding
 * instruction first, because an operator opening a referred case wants to know
 * whether they are still waiting.
 */
const time = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function ExpertReferralCard({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const { data: referrals, isLoading } = useExpertReferrals(caseId);
  const record = useRecordExpertOutcome();

  const [outcome, setOutcome] = useState<'PROCEED' | 'DECLINE'>('PROCEED');
  const [opinion, setOpinion] = useState('');

  const outstanding = referrals?.find(referral => referral.outcome === null);

  const save = async () => {
    if (opinion.trim().length < 8) {
      toast({
        title: 'The opinion is needed',
        description: 'It is what the report will cite, so a word or two is not enough.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await record.mutateAsync({ caseId, outcome, opinion: opinion.trim() });
      setOpinion('');
      toast({ title: 'Expert outcome recorded', description: 'Written to the case file.' });
    } catch (error: any) {
      toast({
        title: 'Not recorded',
        description: error?.response?.data?.error?.message || 'Could not record the outcome.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading || (referrals?.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="h-4 w-4" /> Expert referral
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {referrals?.map(referral => (
          <div key={referral.id} className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{time(referral.referredAt)}</span>
              {referral.expertName && <span>{referral.expertName}</span>}
            </div>
            <p className="whitespace-pre-wrap">
              <span className="text-muted-foreground">Asked — </span>
              {referral.question}
            </p>
            {referral.outcome ? (
              <div className="rounded bg-muted/60 p-2 space-y-1">
                <p className="text-xs font-medium">
                  {referral.outcome === 'PROCEED' ? 'Expert says proceed' : 'Expert declines'}
                  {referral.outcomeAt ? ` · ${time(referral.outcomeAt)}` : ''}
                </p>
                <p className="whitespace-pre-wrap text-sm">{referral.opinion}</p>
              </div>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Awaiting the expert's opinion.
              </p>
            )}
          </div>
        ))}

        {outstanding && (
          <div className="space-y-2 border-t pt-3">
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Outcome</span>
              <NativeSelect
                className="w-full"
                value={outcome}
                onChange={event => setOutcome(event.target.value as 'PROCEED' | 'DECLINE')}
              >
                <option value="PROCEED">The claim may proceed</option>
                <option value="DECLINE">The expert declines it</option>
              </NativeSelect>
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">
                What the expert answered — carried into the report
              </span>
              <Textarea
                rows={3}
                placeholder="e.g. Condition unrelated to any pre-existing illness…"
                value={opinion}
                maxLength={10000}
                onChange={event => setOpinion(event.target.value)}
              />
            </label>
            <Button className="w-full" onClick={() => void save()} disabled={record.isPending}>
              Record outcome
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
