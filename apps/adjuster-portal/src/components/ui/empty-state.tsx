import * as React from 'react';
import { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * What a list shows when it has nothing to show.
 *
 * One shape — icon, a plain statement, a line of context — because the pages
 * had each invented their own, and an operator reading "Nothing here" on one
 * queue and a bare table border on the next cannot tell an empty queue from a
 * broken one. The description is where a page says *why* it might be empty
 * ("cases appear once a claimant is verified"), which is the only part worth
 * writing per page.
 */
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** An action that would fill the list — a "New case" button, a link. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <Icon className="h-10 w-10 text-muted-foreground mb-3" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
