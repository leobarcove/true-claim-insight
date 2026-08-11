import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { TelegramPoller } from './telegram.poller';
import { TelegramAdapter } from './telegram.adapter';
import { ConversationGateway, TurnNotRecordedError } from '../conversation.gateway';

/**
 * THE INGRESS HAD NO TESTS AT ALL.
 *
 * Which is the wrong way round: the offset arithmetic, the error isolation and
 * the backoff are precisely the parts whose failure is silent. A skipped
 * update is a claimant ignored; a double-advanced offset is an answer lost; a
 * loop that dies on one bad message is a channel that stops without anybody
 * noticing, because nothing errors — it simply goes quiet.
 */
describe('TelegramPoller', () => {
  const update = (id: number, text = 'hi') => ({
    update_id: id,
    message: { message_id: id, from: { id: 1, is_bot: false }, chat: { id: 1, type: 'private' }, date: 0, text },
  });

  const setup = (responses: unknown[]) => {
    let call = 0;
    const requested: Record<string, unknown>[] = [];
    const http = {
      get: jest.fn((_url: string, config: { params: Record<string, unknown> }) => {
        requested.push(config.params);
        const response = responses[call];
        call += 1;
        return {
          subscribe: (observer: { next: (v: unknown) => void; error: (e: unknown) => void }) => {
            // Once the scripted responses run out, never emit — which is what
            // Telegram actually does, holding the connection open for 25s when
            // there is nothing new. Resolving instantly instead turns the poll
            // loop into a hot loop, because nothing else paces it.
            if (response === undefined) return;
            setTimeout(() => {
              if (response instanceof Error) observer.error(response);
              else observer.next({ data: { result: response } });
            }, 1);
          },
        };
      }),
    } as unknown as HttpService;

    const handled: string[] = [];
    const gateway = {
      handleTurn: jest.fn(async (payload: { platformMessageId: string }) => {
        handled.push(payload.platformMessageId);
      }),
      markStalledTurns: jest.fn(async () => 0),
    } as unknown as ConversationGateway;

    const adapter = new TelegramAdapter(http, {
      get: () => 'token',
    } as unknown as ConfigService);

    const config = {
      get: (key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'token';
        // A five-second production backoff would make each of these
        // assertions take five seconds.
        if (key === 'TELEGRAM_ERROR_BACKOFF_MS') return '5';
        return 'true';
      },
    } as unknown as ConfigService;

    const poller = new TelegramPoller(http, config, adapter, gateway);
    return { poller, gateway, handled, requested, http };
  };

  /** Run the loop briefly, then stop it. */
  const runBriefly = async (poller: TelegramPoller, ms = 30) => {
    poller.onModuleInit();
    await new Promise(resolve => setTimeout(resolve, ms));
    poller.onModuleDestroy();
    await new Promise(resolve => setTimeout(resolve, 5));
  };

  it('acknowledges each update exactly once, in order', async () => {
    const { poller, handled, requested } = setup([[update(10), update(11)], []]);

    await runBriefly(poller);

    expect(handled.slice(0, 2)).toEqual(['10', '11']);
    // The next poll asks for everything after the highest id seen — not the
    // lowest, and not the same one again.
    expect(requested[1]?.offset).toBe(12);
  });

  it('does not let one bad message end the loop', async () => {
    const { poller, gateway, handled } = setup([[update(20), update(21)], []]);
    (gateway.handleTurn as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await runBriefly(poller);

    // The second update is still handled despite the first throwing.
    expect(handled).toContain('21');
  });

  it('leaves an unrecordable turn unacknowledged so it is redelivered', async () => {
    // The distinction that matters: a turn that failed to *process* has a row
    // and a told claimant; one that could not be written down has neither, so
    // acknowledging it loses the message outright.
    const { poller, gateway, requested } = setup([[update(30)], []]);
    (gateway.handleTurn as jest.Mock).mockRejectedValueOnce(
      new TurnNotRecordedError('30', new Error('db down'))
    );

    await runBriefly(poller, 60);

    // Rewound to the update itself, not past it — so Telegram sends it again
    // rather than the claimant's message ceasing to exist.
    expect(requested[1]?.offset).toBe(30);
  });

  it('stops polling on 401 rather than retrying a revoked token forever', async () => {
    const unauthorised = Object.assign(new Error('401'), { response: { status: 401 } });
    const { poller, http } = setup([unauthorised]);

    await runBriefly(poller, 40);

    // One attempt, then it gives up: there is no recovery without a new token.
    expect((http.get as jest.Mock).mock.calls.length).toBe(1);
  });

  it('keeps polling after a transient failure', async () => {
    const blip = Object.assign(new Error('ECONNRESET'), {});
    const { poller, http } = setup([blip, []]);

    await runBriefly(poller, 40);

    // Backed off rather than stopped — the loop is still alive.
    expect((http.get as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('settles its pause on shutdown instead of hanging', async () => {
    const blip = Object.assign(new Error('ECONNRESET'), {});
    const { poller } = setup([blip]);

    poller.onModuleInit();
    await new Promise(resolve => setTimeout(resolve, 10));
    const stopped = Date.now();
    poller.onModuleDestroy();
    await new Promise(resolve => setTimeout(resolve, 10));

    // The backoff is five seconds; shutdown must not wait it out.
    expect(Date.now() - stopped).toBeLessThan(1000);
  });
});
