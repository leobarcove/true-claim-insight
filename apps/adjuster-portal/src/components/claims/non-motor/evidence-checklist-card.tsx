/**
 * Evidence Checklist — renders required documents for the claim's category
 * from the EvidenceRequirement config table. Each row shows whether the
 * claimant has uploaded at least one document of that type.
 *
 * Data-driven: requirements come from the backend, not hardcoded here.
 * Insurers customise via EvidenceRequirement rows with their tenant_id.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CircleCheck, Circle, FileQuestion } from 'lucide-react';
import { cn, convertToTitleCase } from '@/lib/utils';
import { useEvidenceChecklist } from '@/hooks/use-non-motor';

interface Props {
  claimId: string;
}

export function EvidenceChecklistCard({ claimId }: Props) {
  const { data, isLoading } = useEvidenceChecklist(claimId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Evidence Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  const mandatory = data.filter(r => r.isMandatory);
  const optional = data.filter(r => !r.isMandatory);
  const satisfiedMandatory = mandatory.filter(r => r.satisfied).length;
  const allMandatoryDone = satisfiedMandatory === mandatory.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <FileQuestion className="h-4 w-4" />
          Evidence Checklist
        </CardTitle>
        <Badge
          variant={allMandatoryDone ? 'default' : 'secondary'}
          className={cn(
            allMandatoryDone &&
              'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
          )}
        >
          {satisfiedMandatory} / {mandatory.length} mandatory
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {mandatory.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Required
            </div>
            {mandatory.map(r => (
              <ChecklistRow key={r.documentType} item={r} />
            ))}
          </div>
        )}
        {optional.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Optional
            </div>
            {optional.map(r => (
              <ChecklistRow key={r.documentType} item={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ item }: { item: { documentType: string; isMandatory: boolean; description?: string; satisfied: boolean; uploaded: Array<{ id: string }> } }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {item.satisfied ? (
        <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
      ) : (
        <Circle
          className={cn(
            'h-4 w-4 flex-shrink-0 mt-0.5',
            item.isMandatory ? 'text-orange-400' : 'text-muted-foreground'
          )}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'text-sm font-medium',
              item.satisfied && 'text-muted-foreground line-through decoration-1'
            )}
          >
            {convertToTitleCase(item.documentType)}
          </span>
          {item.uploaded.length > 1 && (
            <Badge variant="secondary" className="h-5 text-xs">
              {item.uploaded.length} files
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}
