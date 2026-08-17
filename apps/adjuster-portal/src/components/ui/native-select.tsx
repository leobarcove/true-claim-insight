import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A styled native <select>.
 *
 * Exists because the browser's own dropdown draws its caret flush against the
 * right edge, with no padding the stylesheet can reach — the only way to space
 * it is `appearance-none` and a chevron of our own. Native rather than the
 * Radix Select deliberately: these are used as action menus (pick a snooze,
 * pick an assignee) where the platform's picker, keyboard behaviour and
 * mobile sheet are exactly right, and only the closed control needed dressing.
 */
export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <span className={cn('relative inline-flex', className)}>
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none rounded-md border bg-background pl-2 pr-8 py-1.5 text-xs',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
        )}
        {...props}
      >
        {children}
      </select>
      {/* pointer-events-none: the chevron is paint, the select underneath is
          the control — a click on the icon must fall through to it. */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
