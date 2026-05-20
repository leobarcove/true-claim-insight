/**
 * Category picker — first step of the FNOL wizard. Renders one tile per
 * enabled ClaimCategory from the categoryConfig registry. Disabled
 * categories (FIRE, LIGHTNING, etc.) are shown greyed-out with a "coming
 * soon" hint so insurers see the roadmap.
 */
import type { ClaimCategory } from '@tci/shared-types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { categoryConfig } from '@/lib/category-config';
import { ChevronRight } from 'lucide-react';

interface Props {
  onSelect: (category: ClaimCategory) => void;
}

export function CategoryPicker({ onSelect }: Props) {
  const all = Object.values(categoryConfig);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Choose claim type</h2>
        <p className="text-sm text-muted-foreground">
          Select the type of claim being filed. Required evidence and external
          verifications differ by category.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {all.map(c => {
          const Icon = c.icon;
          const disabled = !c.enabled;
          return (
            <button
              key={c.key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(c.key)}
              className={cn(
                'text-left',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <Card
                className={cn(
                  'p-4 h-full transition-all',
                  !disabled &&
                    'hover:border-primary hover:shadow-md cursor-pointer',
                  disabled && 'bg-muted/30'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center',
                      c.accentBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', c.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium leading-tight">{c.label}</h3>
                      {!disabled && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                      {c.description}
                    </p>
                    {disabled && (
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
