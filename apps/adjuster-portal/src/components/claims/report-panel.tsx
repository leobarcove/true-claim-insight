import { useEffect, useMemo, useState } from 'react';
import { Download, FileSignature, Send, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useClaimReports,
  useReportActions,
  useReportTemplate,
  type AdjusterReport,
  type ReportSectionContent,
  type ReportStatus,
} from '@/hooks/use-reports';

const STATUS_STYLE: Record<
  ReportStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  IN_REVIEW: { label: 'Awaiting sign-off', variant: 'default' },
  SIGNED: { label: 'Signed', variant: 'default' },
  ISSUED: { label: 'Issued to insurer', variant: 'success' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'secondary' },
};

const errorMessage = (error: any) =>
  error?.response?.data?.error?.message ?? error?.response?.data?.message ?? error?.message;

/**
 * The adjuster's report — step 6, and the handback in step 7.
 *
 * The engine has carried the whole lifecycle since Phase 1c and nothing reached
 * it: a claim could sit at REPORT_PENDING with no way to write, sign or issue
 * anything. What the screen has to get right is that this is a *regulated*
 * document, not a form:
 *
 *  - Each section shows the PD paragraph it discharges, because an author who
 *    cannot see why a section exists writes it to fill the box.
 *  - AI assistance is declared per section, not per report. The disclosure that
 *    matters is which conclusion an AI contributed to (§6: disclosed, never
 *    downplayed).
 *  - Sign-off and issue are separate acts by separate people. The server
 *    enforces PD 12.7 — a junior's report needs a senior's signature — and the
 *    screen never pretends otherwise; it asks and reports what came back.
 */
export function ReportPanel({ claimId, claimStatus }: { claimId?: string; claimStatus?: string }) {
  const { toast } = useToast();
  const { data: reports, isLoading } = useClaimReports(claimId);
  const { create, saveSections, act } = useReportActions(claimId);

  const current = useMemo<AdjusterReport | undefined>(
    () => reports?.find(r => r.status !== 'WITHDRAWN') ?? reports?.[0],
    [reports]
  );
  const { data: template } = useReportTemplate(current?.type ?? 'FINAL');

  const [draft, setDraft] = useState<Record<string, ReportSectionContent>>({});
  useEffect(() => {
    if (current) setDraft(current.sections ?? {});
  }, [current?.id, current?.status]);

  if (isLoading) return null;

  const editable = current?.status === 'DRAFT';
  const missing = (template ?? [])
    .filter(section => section.mandatory && !draft[section.key]?.body?.trim())
    .map(section => section.heading);

  const run = (
    action: 'submit' | 'sign' | 'issue',
    successTitle: string,
    id: string
  ) =>
    act.mutate(
      { id, action },
      {
        onSuccess: () => toast({ title: successTitle }),
        onError: (error: any) =>
          toast({
            title: 'Refused',
            description: errorMessage(error),
            variant: 'destructive',
          }),
      }
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-primary" />
          Adjuster report
          {current && (
            <span className="ml-1 font-mono text-xs text-muted-foreground">
              {current.type.toLowerCase()} · v{current.version}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {current && (
            <Badge variant={STATUS_STYLE[current.status].variant}>
              {STATUS_STYLE[current.status].label}
            </Badge>
          )}
          {current && current.status === 'ISSUED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/api/v1/reports/${current.id}/pdf`, '_blank')}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              PDF
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!current && (
          <>
            <p className="text-sm text-muted-foreground">
              No report opened on this claim. The insurer receives the firm's opinion as a signed
              report; nothing here settles the claim.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  create.mutate('PRELIMINARY', {
                    onSuccess: () => toast({ title: 'Preliminary report opened' }),
                    onError: (error: any) =>
                      toast({ title: 'Refused', description: errorMessage(error), variant: 'destructive' }),
                  })
                }
                disabled={create.isPending}
                variant="outline"
              >
                Open preliminary
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  create.mutate('FINAL', {
                    onSuccess: () => toast({ title: 'Final report opened' }),
                    onError: (error: any) =>
                      toast({ title: 'Refused', description: errorMessage(error), variant: 'destructive' }),
                  })
                }
                disabled={create.isPending}
              >
                Open final report
              </Button>
            </div>
          </>
        )}

        {current && (
          <>
            <div className="space-y-4">
              {(template ?? []).map(section => {
                const content = draft[section.key] ?? { body: '' };
                return (
                  <div key={section.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium">
                        {section.heading}
                        {section.mandatory && <span className="text-destructive"> *</span>}
                      </p>
                      {section.regulatoryBasis && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {section.regulatoryBasis}
                        </span>
                      )}
                    </div>
                    <p className="mb-1.5 text-xs text-muted-foreground">{section.guidance}</p>

                    {editable ? (
                      <>
                        <Textarea
                          rows={4}
                          value={content.body}
                          placeholder={section.guidance}
                          onChange={event =>
                            setDraft(prev => ({
                              ...prev,
                              [section.key]: { ...content, body: event.target.value },
                            }))
                          }
                        />
                        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={Boolean(content.aiAssisted)}
                            onChange={event =>
                              setDraft(prev => ({
                                ...prev,
                                [section.key]: { ...content, aiAssisted: event.target.checked },
                              }))
                            }
                          />
                          <Sparkles className="h-3 w-3" />
                          An AI system materially contributed to this section
                        </label>
                      </>
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {content.body || (
                          <span className="text-muted-foreground">Not completed.</span>
                        )}
                        {content.aiAssisted && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                            <Sparkles className="h-3 w-3" />
                            AI-assisted — disclosed in the issued report
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {editable && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    saveSections.mutate(
                      { id: current.id, sections: draft },
                      {
                        onSuccess: () => toast({ title: 'Saved' }),
                        onError: (error: any) =>
                          toast({ title: 'Could not save', description: errorMessage(error), variant: 'destructive' }),
                      }
                    )
                  }
                  disabled={saveSections.isPending}
                >
                  {saveSections.isPending ? 'Saving…' : 'Save draft'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => run('submit', 'Submitted for sign-off', current.id)}
                  disabled={act.isPending || missing.length > 0}
                >
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Submit for sign-off
                </Button>
                {missing.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Missing: {missing.join(', ')}
                  </span>
                )}
              </div>
            )}

            {current.status === 'IN_REVIEW' && (
              <div className="border-t pt-3">
                <Button
                  size="sm"
                  onClick={() => run('sign', 'Report signed', current.id)}
                  disabled={act.isPending}
                >
                  <FileSignature className="mr-1 h-3.5 w-3.5" />
                  Sign off
                </Button>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  PD 12.7 — a report by an adjuster under supervision must be signed by a senior.
                </p>
              </div>
            )}

            {current.status === 'SIGNED' && (
              <div className="border-t pt-3">
                <Button
                  size="sm"
                  onClick={() => run('issue', 'Report issued to the insurer', current.id)}
                  disabled={act.isPending}
                >
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Issue to insurer
                </Button>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The handback. Immutable once issued, and it discharges the reporting clock — the
                  insurer decides the claim from here.
                </p>
              </div>
            )}

            {current.status === 'ISSUED' && current.issuedAt && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Issued to the insurer on{' '}
                {new Date(current.issuedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {current.countersignBasis ? ` · ${current.countersignBasis}` : ''}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
