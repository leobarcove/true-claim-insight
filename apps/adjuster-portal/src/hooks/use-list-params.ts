import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Tab, search and page for a listing page, held in the URL.
 *
 * A queue is something operators link each other to — "page 3 of Under
 * Review" — and something they refresh mid-shift. Held in useState, either
 * action silently reset every filter to its default, which on a work queue
 * means losing your place. One hook rather than a convention, so every list
 * behaves identically:
 *
 *  - **tab** navigates (a history entry per view change) and resets the page,
 *    because page 4 of one tab is not a place in another.
 *  - **search** replaces rather than pushes — each keystroke rewrites the
 *    URL, and a back button that walks a search letter by letter is unusable.
 *    It resets the page for the same reason a tab does.
 *  - **page** stays out of the URL at 1, so a queue's canonical address does
 *    not grow a `?page=1` nobody asked for.
 *
 * `null` tab means "the page's default view"; a URL value the page's tab bar
 * does not offer also reads as null, so a hand-edited address falls back to
 * something the screen can explain rather than a tabless filter.
 *
 * The URL is an input surface once this hook is in use — the matching server
 * DTO must validate what arrives (see CaseQueryDto) rather than casting it.
 */
export interface UseListParamsOptions {
  /** Valid tab values; anything else in the URL reads as null (the default). */
  tabs?: readonly string[];
  /** Param name for the tab. 'status' where the tab filters a status enum. */
  tabKey?: string;
  searchKey?: string;
  pageKey?: string;
}

export function useListParams(options: UseListParamsOptions = {}) {
  const { tabs, tabKey = 'tab', searchKey = 'q', pageKey = 'page' } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get(tabKey);
  const tab = rawTab && (!tabs || tabs.includes(rawTab)) ? rawTab : null;
  const search = searchParams.get(searchKey) ?? '';
  const pageParam = Number(searchParams.get(pageKey));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  const setTab = (value: string | null) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set(tabKey, value);
      else next.delete(tabKey);
      next.delete(pageKey);
      return next;
    });
  };

  const setSearch = (value: string) => {
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        if (value) next.set(searchKey, value);
        else next.delete(searchKey);
        next.delete(pageKey);
        return next;
      },
      { replace: true }
    );
  };

  const setPage = (value: number, replace = false) => {
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        if (value > 1) next.set(pageKey, String(value));
        else next.delete(pageKey);
        return next;
      },
      { replace }
    );
  };

  return { tab, setTab, search, setSearch, page, setPage };
}

/**
 * Snap a stale page number back inside the list.
 *
 * A copied link can name a page past the end — rows resolved since it was
 * shared, or a typed `?page=99`. Showing the empty page reads as "no cases",
 * which is a different, wrong fact. Replaces rather than pushes, so the dead
 * address does not survive in history.
 */
export function usePageClamp(
  page: number,
  totalPages: number | undefined,
  setPage: (value: number, replace?: boolean) => void
) {
  useEffect(() => {
    if (totalPages === undefined) return;
    const lastPage = Math.max(1, totalPages);
    if (page > lastPage) setPage(lastPage, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);
}
