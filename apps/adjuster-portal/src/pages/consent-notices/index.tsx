import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  PendingNotice,
  useApproveNotice,
  usePendingNotices,
} from '@/hooks/use-consent-notices';

/**
 * Approve the privacy-notice wording claimants are shown.
 *
 * This screen exists because its absence stopped everything. No Case can be
 * opened without a live consent, consent can only be recorded against an
 * *approved* notice, and on a fresh database every notice is unapproved — so
 * intake was blocked on every channel and the only way through was editing the
 * database by hand. The endpoints were written and tested; nothing could reach
 * them. See docs/PDPA_NOTICE_APPROVAL_GAP.md.
 *
 * Approving is deliberately the only action here. Approved wording is
 * immutable — past consents have to stay provable against the exact text the
 * person agreed to — so there is no edit, and no unapprove. A change means a
 * new version.
 */

/** PDPA s.7: the notice must exist in English and Bahasa Malaysia. */
const REQUIRED_LOCALES = ['en', 'ms'] as const;

const LOCALE_LABEL: Record<string, string> = {
  en: 'English',
  ms: 'Bahasa Malaysia',
};

const PURPOSE_LABEL: Record<string, string> = {
  CLAIM_PROCESSING: 'Claim processing',
  BIOMETRIC_ANALYSIS: 'Biometric analysis',
  CROSS_BORDER_TRANSFER: 'Cross-border transfer',
  MARKETING: 'Marketing',
};

function missingLocales(notice: PendingNotice): string[] {
  return REQUIRED_LOCALES.filter(locale => !notice.locales.includes(locale));
}

export function ConsentNoticesPage() {
  const { toast } = useToast();
  const { data: pending, isLoading } = usePendingNotices();
  const approve = useApproveNotice();

  const onApprove = async (notice: PendingNotice) => {
    try {
      await approve.mutateAsync({ purpose: notice.purpose, version: notice.version });
      toast({
        title: `${PURPOSE_LABEL[notice.purpose] ?? notice.purpose} v${notice.version} approved`,
        description: 'Claimants are now shown this wording, and consent is recorded against it.',
      });
    } catch (error: any) {
      toast({
        title: 'Could not approve this version',
        description: error?.response?.data?.error?.message || error?.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-background/50">
      <Header
        title="Consent notices"
        description="Approve the privacy wording claimants agree to before a claim can be opened"
      />

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notice versions…
          </div>
        )}

        {!isLoading && pending?.length === 0 && (
          <Card>
            <CardContent className="flex items-center gap-3 py-8">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Nothing waiting for approval</p>
                <p className="text-sm text-muted-foreground">
                  Every notice version has been approved. Intake is not blocked.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && pending && pending.length > 0 && (
          <>
            <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm leading-relaxed">
                  While a purpose has no approved version, <strong>no claim can be opened</strong>{' '}
                  for it — on the web form, the chat, WhatsApp or Telegram. Read each version in
                  full before approving: once approved the wording cannot be changed, because
                  every consent recorded against it has to stay provable.
                </p>
              </CardContent>
            </Card>

            {pending.map(notice => {
              const missing = missingLocales(notice);
              const key = `${notice.purpose}:${notice.version}`;
              const busy =
                approve.isPending &&
                approve.variables?.purpose === notice.purpose &&
                approve.variables?.version === notice.version;

              return (
                <Card key={key}>
                  <CardContent className="flex flex-wrap items-center gap-4 py-4">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {PURPOSE_LABEL[notice.purpose] ?? notice.purpose}
                        <span className="ml-2 text-muted-foreground">v{notice.version}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {notice.locales.map(locale => (
                          <Badge key={locale} variant="outline" className="text-xs">
                            {LOCALE_LABEL[locale] ?? locale}
                          </Badge>
                        ))}
                        {missing.map(locale => (
                          <Badge
                            key={locale}
                            variant="outline"
                            className="border-destructive text-xs text-destructive"
                          >
                            {LOCALE_LABEL[locale] ?? locale} missing
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {missing.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Cannot be approved until the {missing.map(l => LOCALE_LABEL[l] ?? l).join(' and ')}{' '}
                        wording exists.
                      </p>
                    ) : (
                      <Button onClick={() => onApprove(notice)} disabled={approve.isPending}>
                        {busy ? 'Approving…' : 'Approve this version'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
