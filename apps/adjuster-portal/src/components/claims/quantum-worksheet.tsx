import { useState } from 'react';
import { AlertTriangle, Calculator, History, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  PrepareWorksheetInput,
  SettlementBasis,
  useQuantum,
  useQuantumHistory,
  usePrepareQuantum,
} from '@/hooks/use-quantum';

/**
 * Quantum worksheet on a claim.
 *
 * Money is typed and submitted as text throughout. `<Input type="number">` is
 * deliberately avoided: it coerces to a float, and a rounding artefact here
 * becomes a figure in a report the insurer acts on.
 */

const money = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return `RM ${amount.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const EMPTY: PrepareWorksheetInput = {
  basis: 'REINSTATEMENT',
  assessedLoss: '',
  sumInsured: '',
  depreciationRate: '',
  betterment: '',
  valueAtRisk: '',
  averageCondition: false,
  salvage: '',
  excess: '',
  notes: '',
};

export function QuantumWorksheetPanel({ claimId }: { claimId: string }) {
  const { data: worksheet, isLoading } = useQuantum(claimId);
  const { data: history } = useQuantumHistory(claimId);
  const prepare = usePrepareQuantum(claimId);
  const { toast } = useToast();

  const [form, setForm] = useState<PrepareWorksheetInput>(EMPTY);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const set = (key: keyof PrepareWorksheetInput, value: string | boolean) =>
    setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      const result = await prepare.mutateAsync(form);
      toast({
        title: `Worksheet revision ${result.revision} prepared`,
        description: `Recommended ${money(result.recommended)}`,
      });
      setOpen(false);
      setForm(EMPTY);
    } catch (error: any) {
      // The server refuses contradictory input — depreciation on a
      // reinstatement policy, a zero sum insured — and its message names the
      // problem, so it is shown rather than replaced with something generic.
      toast({
        variant: 'destructive',
        title: 'Worksheet not prepared',
        description:
          error?.response?.data?.error?.message ??
          error?.message ??
          'The figures could not be accepted.',
      });
    }
  };

  const canSubmit = form.assessedLoss.trim() !== '' && form.sumInsured.trim() !== '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" />
          Quantum
          {worksheet && (
            <Badge variant="secondary" className="ml-1 font-mono text-xs">
              r{worksheet.revision}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {history && history.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(v => !v)}>
              <History className="mr-1 h-3.5 w-3.5" />
              {history.length} revisions
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen(v => !v)}>
            {worksheet ? 'Revise' : 'Prepare'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && !worksheet && !open && (
          <p className="text-sm text-muted-foreground">
            No worksheet prepared. The report's quantum section will be empty until one exists.
          </p>
        )}

        {worksheet && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-4 font-mono text-sm">
              {worksheet.lines.map(line => (
                <div key={line.key} className="flex justify-between gap-4 py-0.5" title={line.basis}>
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="tabular-nums">{money(line.amount)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>Recommended</span>
                <span className="tabular-nums">{money(worksheet.recommended)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {worksheet.basis === 'REINSTATEMENT' ? 'Reinstatement' : 'Indemnity'}
              </Badge>
              {worksheet.averageApplied && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  Average applied
                  {worksheet.averageRatio &&
                    ` — ${(Number(worksheet.averageRatio) * 100).toFixed(2)}%`}
                </Badge>
              )}
              {worksheet.underinsured && !worksheet.averageApplied && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  Underinsured, average not applied
                </Badge>
              )}
              {worksheet.cappedAtSumInsured && (
                <Badge variant="outline">Limited to sum insured</Badge>
              )}
            </div>

            {worksheet.warnings.length > 0 && (
              // Prominent by design: these are unresolved questions about the
              // figure, and they are carried into the report as "matters
              // outstanding" whether or not anyone reads them here.
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Matters outstanding
                </p>
                <ul className="ml-5 list-disc space-y-0.5 text-sm text-muted-foreground">
                  {worksheet.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {worksheet.notes && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{worksheet.notes}</p>
            )}
          </div>
        )}

        {showHistory && history && (
          <div className="rounded-lg border">
            {history.map(revision => (
              <div
                key={revision.id}
                className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  r{revision.revision} · {new Date(revision.createdAt).toLocaleDateString('en-GB')}
                </span>
                <span className="tabular-nums">{money(revision.recommended)}</span>
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Settlement basis</Label>
                <Select
                  value={form.basis}
                  onValueChange={(value: SettlementBasis) => set('basis', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REINSTATEMENT">Reinstatement (new for old)</SelectItem>
                    <SelectItem value="INDEMNITY">Indemnity (value at loss)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Field
                label="Assessed loss"
                required
                value={form.assessedLoss}
                onChange={v => set('assessedLoss', v)}
                placeholder="50000.00"
              />
              <Field
                label="Sum insured"
                required
                value={form.sumInsured}
                onChange={v => set('sumInsured', v)}
                placeholder="150000.00"
              />
              <Field
                label="Value at risk"
                hint="Required to test underinsurance"
                value={form.valueAtRisk ?? ''}
                onChange={v => set('valueAtRisk', v)}
                placeholder="250000.00"
              />
              <Field
                label="Depreciation rate"
                hint="0–1, indemnity basis only"
                value={form.depreciationRate ?? ''}
                onChange={v => set('depreciationRate', v)}
                placeholder="0.25"
              />
              <Field
                label="Betterment"
                value={form.betterment ?? ''}
                onChange={v => set('betterment', v)}
                placeholder="2000.00"
              />
              <Field
                label="Salvage"
                value={form.salvage ?? ''}
                onChange={v => set('salvage', v)}
                placeholder="1500.00"
              />
              <Field
                label="Excess"
                value={form.excess ?? ''}
                onChange={v => set('excess', v)}
                placeholder="1000.00"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="averageCondition">Policy carries a condition of average</Label>
                <p className="text-xs text-muted-foreground">
                  Applied automatically where the value at risk exceeds the sum insured
                </p>
              </div>
              <Switch
                id="averageCondition"
                checked={form.averageCondition}
                onCheckedChange={value => set('averageCondition', value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Basis of assessment</Label>
              <Textarea
                rows={3}
                value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="How the loss was assessed, and on what evidence."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit || prepare.isPending}>
                {prepare.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {worksheet ? 'Prepare revision' : 'Prepare worksheet'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {/* Text, not number: see the note at the top of this file. */}
      <Input
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
