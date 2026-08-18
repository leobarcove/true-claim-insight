import { useState } from 'react';
import { ClipboardList, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRecordSiteVisit, useSiteVisits } from '@/hooks/use-claims';

/**
 * What each site visit found — the record beside the appointment.
 *
 * The appointment card says a visit was arranged; this says what happened
 * when someone stood on the ground, which is what the report's facts section
 * cites (PD 12.6). Append-only by design: the form always adds a new
 * attendance, and nothing here edits or deletes one — a wrong record is
 * corrected by a further visit's record saying so.
 */
const formatVisitTime = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function SiteVisitCard({ claimId, settled }: { claimId: string; settled: boolean }) {
  const { toast } = useToast();
  const { data: visits, isLoading } = useSiteVisits(claimId);
  const record = useRecordSiteVisit();

  const [open, setOpen] = useState(false);
  const [attendedAt, setAttendedAt] = useState('');
  const [findings, setFindings] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [limitations, setLimitations] = useState('');

  const save = async () => {
    if (!attendedAt || !findings.trim()) {
      toast({
        title: 'Attendance and findings are both needed',
        description: 'A visit record without them is a diary entry, not evidence.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await record.mutateAsync({
        claimId,
        attendedAt,
        findings: findings.trim(),
        locationNote: locationNote.trim() || undefined,
        limitations: limitations.trim() || undefined,
      });
      setOpen(false);
      setAttendedAt('');
      setFindings('');
      setLocationNote('');
      setLimitations('');
      toast({ title: 'Visit recorded', description: 'Appended to the claim file and audited.' });
    } catch (error: any) {
      toast({
        title: 'Not recorded',
        description: error?.response?.data?.error?.message || 'Could not record the visit.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Site visit findings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && (visits?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No attendance recorded yet. The report cites what was found here, so the visit is
            not complete until it is written down.
          </p>
        )}

        {visits?.map(visit => (
          <div key={visit.id} className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {formatVisitTime(visit.attendedAt)}
              </span>
              <span>{visit.attendedBy.fullName}</span>
            </div>
            {visit.locationNote && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {visit.locationNote}
              </div>
            )}
            <p className="whitespace-pre-wrap">{visit.findings}</p>
            {visit.limitations && (
              <p className="text-xs rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 p-2 whitespace-pre-wrap">
                Limitations: {visit.limitations}
              </p>
            )}
          </div>
        ))}

        {!settled && !open && (
          <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
            Record a visit
          </Button>
        )}

        {!settled && open && (
          <div className="space-y-2 border-t pt-3">
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Attended at</span>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={attendedAt}
                max={new Date().toISOString().slice(0, 16)}
                onChange={event => setAttendedAt(event.target.value)}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Location, as attended (optional)</span>
              <input
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="e.g. risk address; access via rear lane"
                value={locationNote}
                maxLength={1000}
                onChange={event => setLocationNote(event.target.value)}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Findings</span>
              <Textarea
                rows={4}
                placeholder="What was found on the ground…"
                value={findings}
                maxLength={20000}
                onChange={event => setFindings(event.target.value)}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">
                Limitations (optional) — what bounded the inspection
              </span>
              <Textarea
                rows={2}
                placeholder="e.g. first floor inaccessible; standing water"
                value={limitations}
                maxLength={5000}
                onChange={event => setLimitations(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void save()} disabled={record.isPending}>
                Record visit
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {settled && (visits?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            The claim is settled; the record above is what the assessment relied on.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
