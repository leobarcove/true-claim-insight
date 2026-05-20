/**
 * Fraud Signals card — the demo wow-factor. Renders Shift Technology-
 * style independent signal events with severity color coding and a
 * "Re-evaluate" trigger that runs all applicable providers again.
 *
 * Signals are grouped by category (PARAMETRIC, BEHAVIOURAL, NETWORK, ...)
 * and within each group sorted by severity. Expanding a row shows the
 * provider name, confidence, and raw evidence.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import type { FraudSignal, SignalSeverity, FraudCategory } from '@tci/shared-types';

// Runtime string-literal mirrors of the SignalSeverity / FraudCategory enums.
// Defined locally so we don't pay the CJS-ESM interop cost of importing the
// enum values from the shared-types dist.
const SEVERITY = {
  CRITICAL: 'CRITICAL' as SignalSeverity,
  HIGH: 'HIGH' as SignalSeverity,
  MEDIUM: 'MEDIUM' as SignalSeverity,
  LOW: 'LOW' as SignalSeverity,
  INFO: 'INFO' as SignalSeverity,
};

const CATEGORY = {
  PARAMETRIC: 'PARAMETRIC' as FraudCategory,
  IDENTITY: 'IDENTITY' as FraudCategory,
  BEHAVIOURAL: 'BEHAVIOURAL' as FraudCategory,
  DOCUMENT: 'DOCUMENT' as FraudCategory,
  NETWORK: 'NETWORK' as FraudCategory,
  ENVIRONMENTAL: 'ENVIRONMENTAL' as FraudCategory,
  INVENTORY: 'INVENTORY' as FraudCategory,
  POLICY: 'POLICY' as FraudCategory,
};
import { cn, convertToTitleCase } from '@/lib/utils';
import {
  useEvaluateFraudSignals,
  useFraudSignals,
} from '@/hooks/use-non-motor';

interface Props {
  claimId: string;
}

const severityRank = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
} as Record<SignalSeverity, number>;

const severityClass = {
  CRITICAL:
    'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900',
  HIGH:
    'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900',
  MEDIUM:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900',
  LOW:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900',
  INFO:
    'bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300 border-gray-200 dark:border-gray-800',
} as Record<SignalSeverity, string>;

const categoryLabels = {
  PARAMETRIC: 'Parametric verification',
  IDENTITY: 'Identity & eKYC',
  BEHAVIOURAL: 'Behavioural analysis',
  DOCUMENT: 'Document forensics',
  NETWORK: 'Network & graph',
  ENVIRONMENTAL: 'Environmental data',
  INVENTORY: 'Inventory validation',
  POLICY: 'Policy timing',
} as Record<FraudCategory, string>;

export function FraudSignalsCard({ claimId }: Props) {
  const { data: signals, isLoading } = useFraudSignals(claimId);
  const evaluate = useEvaluateFraudSignals(claimId);

  const highestSeverity = signals?.reduce<SignalSeverity | null>(
    (max, s) =>
      max == null || severityRank[s.severity] > severityRank[max]
        ? s.severity
        : max,
    null
  );

  // Group by category, ordered by severityRank descending within each.
  const grouped = (signals ?? []).reduce<Record<string, FraudSignal[]>>(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {}
  );
  for (const group of Object.values(grouped)) {
    group.sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity]
    );
  }
  const categoriesInOrder = Object.keys(grouped).sort((a, b) => {
    const maxA = Math.max(...grouped[a].map(s => severityRank[s.severity]));
    const maxB = Math.max(...grouped[b].map(s => severityRank[s.severity]));
    return maxB - maxA;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Fraud Signals
          {highestSeverity && (
            <Badge
              variant="outline"
              className={cn(
                'border h-5 text-[10px] tracking-wider uppercase',
                severityClass[highestSeverity]
              )}
            >
              {highestSeverity}
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => evaluate.mutate()}
          disabled={evaluate.isPending}
        >
          <RefreshCcw
            className={cn(
              'h-3.5 w-3.5 mr-1.5',
              evaluate.isPending && 'animate-spin'
            )}
          />
          {evaluate.isPending ? 'Evaluating…' : 'Re-evaluate'}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && (!signals || signals.length === 0) && (
          <div className="text-sm text-muted-foreground py-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            No fraud signals yet. Click "Re-evaluate" to run all applicable
            providers.
          </div>
        )}

        {!isLoading && signals && signals.length > 0 && (
          <div className="space-y-4">
            {categoriesInOrder.map(category => (
              <div key={category}>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {categoryLabels[category as FraudCategory] ?? category}
                </div>
                <div className="space-y-1.5">
                  {grouped[category].map(signal => (
                    <SignalRow key={signal.id} signal={signal} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SignalRow({ signal }: { signal: FraudSignal }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    signal.message || (signal.rawData && Object.keys(signal.rawData).length > 0);

  return (
    <div
      className={cn(
        'rounded-md border bg-card text-sm',
        severityClass[signal.severity].split(' ').filter(c => c.startsWith('border-')).join(' ')
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        disabled={!hasDetails}
        className={cn(
          'w-full flex items-center justify-between gap-3 p-2.5 text-left',
          hasDetails && 'hover:bg-muted/50 cursor-pointer'
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                'border h-5 text-[10px] tracking-wider uppercase',
                severityClass[signal.severity]
              )}
            >
              {signal.severity}
            </Badge>
            <span className="font-medium truncate">
              {convertToTitleCase(signal.signalType)}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(signal.confidence * 100)}% conf.
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {signal.provider}
          </div>
        </div>
        {hasDetails && (
          <span className="text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="border-t px-2.5 py-2 space-y-1.5 bg-muted/30">
          {signal.message && (
            <p className="text-xs leading-relaxed">{signal.message}</p>
          )}
          {signal.rawData && Object.keys(signal.rawData).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Evidence
              </summary>
              <pre className="mt-1.5 text-[11px] bg-muted/50 p-1.5 rounded overflow-x-auto">
                {JSON.stringify(signal.rawData, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
