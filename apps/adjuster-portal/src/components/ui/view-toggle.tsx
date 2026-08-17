import { Grid, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The table/card switch listing pages offer.
 *
 * Was pasted into three pages, where the copies had begun to drift in
 * padding and margin. The preference itself stays with the page (some may
 * one day persist it); this owns only the control.
 */
export type ViewMode = 'table' | 'card';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <div className={cn('flex items-center bg-muted/50 rounded-lg p-1', className)}>
      <InfoTooltip
        content="List"
        direction="top"
        fontSize="text-[11px]"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={value === 'table'}
            className={cn('h-7 w-7 rounded-md', value === 'table' && 'bg-background shadow-sm')}
            onClick={() => onChange('table')}
          >
            <List className="h-4 w-4" />
          </Button>
        }
      />
      <InfoTooltip
        content="Grid"
        direction="top"
        fontSize="text-[11px]"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={value === 'card'}
            className={cn('h-7 w-7 rounded-md', value === 'card' && 'bg-background shadow-sm')}
            onClick={() => onChange('card')}
          >
            <Grid className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}
