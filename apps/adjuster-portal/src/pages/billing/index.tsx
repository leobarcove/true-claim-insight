import { Receipt } from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useInsurerStatement } from '@/hooks/use-billing';

/**
 * Ageing buckets, oldest last — the order a credit controller reads them in.
 * Anything past CURRENT is money the firm has earned and not been paid.
 */
const BUCKETS: { key: string; label: string; overdue: boolean }[] = [
  { key: 'CURRENT', label: 'Not yet due', overdue: false },
  { key: 'OVERDUE_1_30', label: '1–30 days', overdue: true },
  { key: 'OVERDUE_31_60', label: '31–60 days', overdue: true },
  { key: 'OVERDUE_61_90', label: '61–90 days', overdue: true },
  { key: 'OVERDUE_90_PLUS', label: '90+ days', overdue: true },
];

const money = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What the firm is owed, by whom, and for how long.
 *
 * The CSP 11.16–11.18 evidence. Aggregated per insurer rather than listed per
 * note, because the question this page answers is whether a panel is paying —
 * a single late note is noise, a column of 90-day debt is a conversation.
 */
export function BillingPage() {
  const { data: rows, isLoading } = useInsurerStatement();

  const total = (rows ?? []).reduce((sum, row) => sum + row.outstanding, 0);
  const overdue = (rows ?? []).reduce(
    (sum, row) =>
      sum + BUCKETS.filter(b => b.overdue).reduce((s, b) => s + (row.ageing[b.key] ?? 0), 0),
    0
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Fee notes"
        description="Issued and unsettled, per insurer — the CSP 11.16–11.18 record"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && !rows?.length && (
          <Card>
            <CardContent className="p-12 text-center">
              <Receipt className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing outstanding. Fee notes appear here once issued to an insurer, and leave
                once settled.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && Boolean(rows?.length) && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Outstanding
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums">{money(total)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Past due
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={cn(
                      'text-3xl font-bold tabular-nums',
                      overdue > 0 && 'text-destructive'
                    )}
                  >
                    {money(overdue)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="px-4 py-3 font-medium">Insurer</th>
                        {BUCKETS.map(bucket => (
                          <th key={bucket.key} className="px-4 py-3 text-right font-medium">
                            {bucket.label}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows!.map(row => (
                        <tr key={row.insurerTenantId} className="border-b last:border-b-0">
                          <td className="px-4 py-3 font-medium">{row.insurerName}</td>
                          {BUCKETS.map(bucket => {
                            const amount = row.ageing[bucket.key] ?? 0;
                            return (
                              <td
                                key={bucket.key}
                                className={cn(
                                  'px-4 py-3 text-right tabular-nums',
                                  amount === 0 && 'text-muted-foreground',
                                  amount > 0 && bucket.overdue && 'text-destructive font-medium'
                                )}
                              >
                                {amount === 0 ? '—' : money(amount)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {money(row.outstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
