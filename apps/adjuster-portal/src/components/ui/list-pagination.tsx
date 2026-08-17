import { Button } from '@/components/ui/button';

/**
 * The pagination footer every listing page draws under its table.
 *
 * One component because the hand-rolled copies disagreed: one page centred
 * chevron-only buttons, another put worded buttons right with the count left,
 * and their disabled logic was written twice each time. This is the layout
 * that survived: the position statement carries the total, because "Page 2 of
 * 9" answers where you are and "(87 cases)" answers whether it is worth
 * paging at all — and worded buttons, because a bare chevron is the one
 * control on the screen whose meaning is guessed.
 *
 * Renders nothing on a single page: a footer saying "Page 1 of 1" is noise.
 */
interface ListPaginationProps {
  page: number;
  totalPages: number;
  /** Total row count across all pages, for the "(n things)" suffix. */
  total?: number;
  /** What a row is, pluralised by the caller: "cases", "claims", "sessions". */
  noun?: string;
  onPageChange: (page: number) => void;
}

export function ListPagination({ page, totalPages, total, noun, onPageChange }: ListPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
        {total !== undefined && noun ? ` (${total} ${noun})` : ''}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
