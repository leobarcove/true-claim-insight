import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useTenantConfig, useUpdateTenantConfig } from '@/hooks/use-tenant-config';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Per-tenant configuration for firm admins.
 *
 * These are not preferences. Each one changes how claims are handled — whether
 * a countersign blocks, which calendar computes a CSP deadline, whether a claim
 * may be settled without an interview — so the screen states the consequence
 * beside the control rather than leaving it to a tooltip.
 */

const CALENDAR_STATES = [
  'Kuala Lumpur',
  'Selangor',
  'Johor',
  'Kedah',
  'Kelantan',
  'Terengganu',
  'Penang',
  'Perak',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perlis',
  'Sabah',
  'Sarawak',
];

/** Malaysian states observing a Friday–Saturday weekend. */
const FRIDAY_WEEKEND = new Set(['Johor', 'Kedah', 'Kelantan', 'Terengganu']);

const FAST_TRACK_CATEGORIES = ['TRAVEL', 'FIRE', 'FLOOD', 'BURGLARY', 'LIGHTNING', 'HOH'];

export function FirmConfiguration() {
  const { user } = useAuthStore();
  const tenantId = user?.currentTenantId;
  const { data, isLoading } = useTenantConfig(tenantId);
  const update = useUpdateTenantConfig(tenantId ?? '');
  const { toast } = useToast();

  const [calendarState, setCalendarState] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [licensedMode, setLicensedMode] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!data) return;
    setCalendarState(data.settings.calendarState);
    setCategories(data.settings.fastTrackCategories);
    setLimits(data.settings.fastTrackLimits);
    setLicensedMode(data.settings.licensedMode);
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const licensedModeChanged = licensedMode !== data.settings.licensedMode;

  const save = async (patch: Parameters<typeof update.mutateAsync>[0], label: string) => {
    try {
      await update.mutateAsync(patch);
      toast({ title: `${label} saved` });
      setReason('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `${label} not saved`,
        // The server explains why — an unknown calendar state, a malformed
        // ceiling, a licensed-mode change with no reason.
        description:
          error?.response?.data?.error?.message ?? error?.message ?? 'The change was refused.',
      });
    }
  };

  const toggleCategory = (category: string) =>
    setCategories(current =>
      current.includes(category)
        ? current.filter(c => c !== category)
        : [...current, category]
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Regulatory mode
          </CardTitle>
          <CardDescription>
            Whether this firm operates as a BNM-registered adjuster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="licensedMode" className="text-base">
                Licensed mode
              </Label>
              <p className="max-w-prose text-sm text-muted-foreground">
                Turns advisory compliance checks into blocking ones: reports must be authored and
                signed by adjusting employees, a senior countersign becomes mandatory, and conflict
                screening refuses an assignment rather than warning about it.
              </p>
              <Badge variant="outline" className="mt-1">
                {data.settings.licensedMode ? 'Registered — gates enforced' : 'TPA — gates advisory'}
              </Badge>
            </div>
            <Switch id="licensedMode" checked={licensedMode} onCheckedChange={setLicensedMode} />
          </div>

          {licensedModeChanged && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                This change must be explicable later
              </p>
              <Textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Why is this changing? e.g. BNM registration granted on 12/08/2026"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setLicensedMode(data.settings.licensedMode)}>
                  Cancel
                </Button>
                <Button
                  disabled={!reason.trim() || update.isPending}
                  onClick={() => save({ licensedMode, reason }, 'Licensed mode')}
                >
                  {update.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Confirm change
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Working-day calendar</CardTitle>
          <CardDescription>
            Which state's public holidays and weekend the CSP deadlines are computed against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label>State</Label>
              <Select value={calendarState} onValueChange={setCalendarState}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALENDAR_STATES.map(state => (
                    <SelectItem key={state} value={state}>
                      {state}
                      {FRIDAY_WEEKEND.has(state) && ' — Fri/Sat weekend'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={calendarState === data.settings.calendarState || update.isPending}
              onClick={() => save({ calendarState }, 'Calendar state')}
            >
              Save
            </Button>
          </div>
          {FRIDAY_WEEKEND.has(calendarState) && (
            <p className="text-sm text-muted-foreground">
              {calendarState} observes a Friday–Saturday weekend, so working-day deadlines are
              computed differently from the rest of the country.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Small-claims fast track</CardTitle>
          <CardDescription>
            Categories this firm will settle on a desk review, and the ceiling for each. A category
            with no ceiling is never fast-tracked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FAST_TRACK_CATEGORIES.map(category => (
              <Button
                key={category}
                size="sm"
                variant={categories.includes(category) ? 'default' : 'outline'}
                onClick={() => toggleCategory(category)}
              >
                {category.toLowerCase()}
              </Button>
            ))}
          </div>

          {categories.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map(category => (
                <div key={category} className="space-y-1.5">
                  <Label>{category.toLowerCase()} ceiling (RM)</Label>
                  {/* Text, not number — the ceiling turns on equality at the
                      boundary and the server takes a decimal string. */}
                  <Input
                    inputMode="decimal"
                    value={limits[category] ?? ''}
                    onChange={e =>
                      setLimits(current => ({ ...current, [category]: e.target.value }))
                    }
                    placeholder="5000.00"
                  />
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            A claim is desk-reviewed only when all four conditions hold: the category is listed,
            the estimate is within the ceiling, no fraud signal is open at medium or above, and the
            evidence checklist is complete. Medical claims are never desk-reviewed.
          </p>

          <div className="flex justify-end">
            <Button
              disabled={update.isPending}
              onClick={() =>
                save(
                  {
                    fastTrackCategories: categories,
                    // Only ceilings for still-selected categories: deselecting a
                    // category should remove its limit, not orphan it.
                    fastTrackLimits: Object.fromEntries(
                      categories
                        .filter(category => (limits[category] ?? '').trim() !== '')
                        .map(category => [category, limits[category].trim()])
                    ),
                  },
                  'Fast track'
                )
              }
            >
              {update.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save fast track
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
