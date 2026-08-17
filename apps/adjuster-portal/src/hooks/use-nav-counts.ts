import { useCases } from '@/hooks/use-cases';
import { useConversations } from '@/hooks/use-conversations';
import { useInboundMessages } from '@/hooks/use-ingestion';

/**
 * Pending-work counts for the sidebar, keyed by route.
 *
 * The navigation's job for an operations team is to answer "where is work
 * waiting" before anything is clicked, so each queue surface carries the
 * number of items the *firm currently owes action on* — not its row count:
 *
 *  - `/intake`         emails nobody has dealt with: NEEDS_REVIEW + FAILED.
 *                      PENDING is the worker's, not a person's.
 *  - `/conversations`  threads where a claimant is waiting on a human (OPEN).
 *                      A PENDING thread is waiting on the claimant and owes
 *                      the firm nothing.
 *  - `/cases`          SUBMITTED (nobody has opened it) + UNDER_REVIEW
 *                      (opened, undecided). INFO_REQUESTED is excluded — that
 *                      ball is in the claimant's court.
 *
 * Every query reuses the query key its page already uses, so an open page and
 * the badge share one fetch rather than polling twice. `enabled` gates each
 * query on the same visibility the nav item itself passed, so a role that
 * cannot see a queue never requests its numbers.
 */
export function useNavCounts(enabled: {
  intake: boolean;
  conversations: boolean;
  cases: boolean;
}): Record<string, number> {
  const { data: inbound } = useInboundMessages(undefined, { enabled: enabled.intake });
  const { data: conversations } = useConversations(undefined, {
    enabled: enabled.conversations,
  });
  // limit 1: the list rows are discarded — statusBreakdown rides on the
  // response whatever the page size, and one row is the cheapest way to ask.
  const { data: caseList } = useCases({ limit: 1 }, { enabled: enabled.cases });

  const intakeCount = (inbound ?? []).filter(
    message => message.status === 'NEEDS_REVIEW' || message.status === 'FAILED'
  ).length;

  const conversationCount = (conversations ?? []).filter(row => row.status === 'OPEN').length;

  const breakdown = caseList?.statusBreakdown ?? {};
  const caseCount = (breakdown['SUBMITTED'] ?? 0) + (breakdown['UNDER_REVIEW'] ?? 0);

  return {
    '/intake': intakeCount,
    '/conversations': conversationCount,
    '/cases': caseCount,
  };
}
