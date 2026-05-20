/**
 * Property Details panel — replaces the motor Vehicle Details panel when
 * a claim's category is FLOOD (and later FIRE, BURGLARY, etc.). Reads
 * directly from claim.floodClaim populated by the polymorphic sub-table.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Home, Ruler, Building2, MapPin, CircleAlert, CircleCheck } from 'lucide-react';
import type { Claim, FloodClaim } from '@tci/shared-types';
import { convertToTitleCase } from '@/lib/utils';

interface Props {
  claim: Claim;
}

export function PropertyDetailsPanel({ claim }: Props) {
  const flood = claim.floodClaim;
  if (!flood) return null;

  const damage = (n: number | string | undefined): string => {
    if (n === undefined || n === null) return '—';
    const v = typeof n === 'string' ? Number(n) : n;
    if (!Number.isFinite(v) || v === 0) return '—';
    return `RM ${v.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
  };

  const totalRm = [
    flood.buildingDamageRm,
    flood.contentsDamageRm,
    flood.vehicleDamageRm,
  ]
    .map(n => (typeof n === 'string' ? Number(n) : n ?? 0))
    .reduce((a, b) => a + (b ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-4 w-4" />
          Property Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Property Type" value={flood.propertyType ? convertToTitleCase(flood.propertyType) : '—'} icon={Building2} />
        <Row
          label="Floor Level"
          value={flood.propertyFloorLevel != null ? `${flood.propertyFloorLevel === 0 ? 'Ground floor' : `Level ${flood.propertyFloorLevel}`}` : '—'}
        />
        <Row
          label="Elevation"
          value={flood.propertyElevationMeters != null ? `${flood.propertyElevationMeters} m above sea level` : '—'}
          icon={Ruler}
        />
        <Row label="Postcode" value={flood.postcode ?? '—'} icon={MapPin} />
        <Row label="State" value={flood.state ?? '—'} />

        <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Flood incident
          </div>
          <Row label="Source" value={flood.source ? convertToTitleCase(flood.source) : '—'} />
          <Row label="Water Depth" value={flood.waterDepthCm != null ? `${flood.waterDepthCm} cm` : '—'} />
          <Row label="Duration" value={flood.durationHours != null ? `${flood.durationHours} hours` : '—'} />
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Claimed damage
          </div>
          <Row label="Building" value={damage(flood.buildingDamageRm)} />
          <Row label="Contents" value={damage(flood.contentsDamageRm)} />
          <Row label="Vehicle" value={damage(flood.vehicleDamageRm)} />
          <div className="flex items-center justify-between pt-1 border-t border-dashed">
            <span className="font-medium">Total declared</span>
            <span className="font-semibold">RM {totalRm.toLocaleString('en-MY')}</span>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            External verification
          </div>
          <ParametricBadge value={flood.parametricTriggerMet} />
          <Row label="MetMalaysia event" value={flood.metMalaysiaEventRef ?? 'not linked'} />
          <Row label="JPS gauge" value={flood.jpsGaugeId ?? 'not linked'} />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function ParametricBadge({ value }: { value: boolean | null | undefined }) {
  if (value === true) {
    return (
      <div className="flex items-start gap-2">
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CircleCheck className="h-3 w-3 mr-1" />
          Parametric trigger met
        </Badge>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-start gap-2">
        <Badge variant="destructive">
          <CircleAlert className="h-3 w-3 mr-1" />
          Parametric trigger not met
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">Parametric trigger</span>
      <span className="text-muted-foreground italic">not yet evaluated</span>
    </div>
  );
}
