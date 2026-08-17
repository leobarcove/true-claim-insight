import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The filter-tab strip every listing page draws above its table.
 *
 * One component rather than five hand-rolled copies, because the copies had
 * already drifted: different padding, different overflow handling, and one
 * page whose active tab was styled but not announced. Same-purpose UI that
 * looks slightly different per page reads as five products, and an operator
 * moving between queues should not have to re-learn the tab bar.
 *
 * `value: null` is the "All" (or default) tab — matching useListParams, where
 * null means the URL carries no tab at all.
 */
export interface ListTab {
  value: string | null;
  label: string;
  /** Shown as "(n)" after the label. Omit to show the label alone. */
  count?: number;
}

interface ListTabsProps {
  tabs: ListTab[];
  active: string | null;
  onChange: (value: string | null) => void;
  /** Right-hand slot — a view-mode toggle, a refresh button. */
  end?: React.ReactNode;
  className?: string;
}

export function ListTabs({ tabs, active, onChange, end, className }: ListTabsProps) {
  return (
    <div
      data-horizontal="true"
      className={cn(
        'flex items-center border-b border-border overflow-x-auto whitespace-nowrap custom-scrollbar',
        end && 'justify-between',
        className
      )}
    >
      <div className="flex">
        {tabs.map(tab => {
          const isActive = active === tab.value;
          return (
            <button
              key={tab.value ?? '__all'}
              type="button"
              onClick={() => onChange(tab.value)}
              // Announced, not merely coloured: the underline is invisible to
              // a screen reader.
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'px-4 py-2 mx-1 font-medium text-sm transition-colors border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.count !== undefined && ` (${tab.count})`}
            </button>
          );
        })}
      </div>
      {end}
    </div>
  );
}
