import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { adoptPublicSession, publicConversationKey } from '@/hooks/use-public-conversation';
import { PublicChatPage } from '@/pages/chat';

/**
 * The claim, opened as a form from inside Telegram.
 *
 * A Mini App is an ordinary web page that Telegram renders in a webview and
 * hands a signed launch payload. That payload — `initData` — is the entire
 * reason this route exists: it is Telegram vouching for who opened the page,
 * signed with a key derived from the bot token, so the server can resolve the
 * conversation this person was already having in the thread rather than
 * starting a new one.
 *
 * **This is not a second intake.** It renders the same conversation as the web
 * chat, against the same binding and the same case. What changes is only the
 * controls: `AnswerControl` draws a real date picker and a scrollable list from
 * `answerType`, where the thread has to ask for typed text and cap its buttons.
 * The claimant can close this at any point and carry on in the chat, because
 * both are the same thread and every reply is persisted to it.
 */
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

type Status = 'verifying' | 'ready' | 'unavailable' | 'refused';

const TELEGRAM_SDK = 'https://telegram.org/js/telegram-web-app.js';

/**
 * The SDK is loaded here rather than in index.html on purpose.
 *
 * It is a third-party script from a host every other page has no business
 * talking to, and every other page includes the claimant's own claim. Loading
 * it only on the one route that needs it keeps that reach as narrow as the
 * feature is.
 */
const loadTelegramSdk = (): Promise<void> =>
  new Promise(resolve => {
    if (window.Telegram?.WebApp) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SDK}"]`);
    if (existing) return existing.addEventListener('load', () => resolve(), { once: true });

    const script = document.createElement('script');
    script.src = TELEGRAM_SDK;
    script.async = true;
    // Resolving on error too, so a blocked script falls through to the "open
    // this from Telegram" message rather than a spinner that never stops.
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(script);
  });

export function TelegramMiniAppPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadTelegramSdk();
      const webApp = window.Telegram?.WebApp;
      webApp?.ready?.();
      webApp?.expand?.();

      const initData = webApp?.initData;
      if (!initData) {
        // Opened in an ordinary browser, or the SDK could not load. There is
        // no attestation to check, so there is nothing to do but say so.
        if (!cancelled) setStatus('unavailable');
        return;
      }

      try {
        const { data } = await apiClient.post<{ data?: { session: string }; session?: string }>(
          '/public/conversation/telegram/session',
          { initData }
        );
        const session = (data as any)?.data?.session ?? (data as any)?.session;
        if (!session) throw new Error('No session returned');
        if (cancelled) return;

        adoptPublicSession(session);
        // The transcript is fetched under the new identity, not whatever this
        // browser happened to be holding. Without this the first render can
        // show a stale conversation from a previous visit for a moment.
        queryClient.removeQueries({ queryKey: publicConversationKey });
        setStatus('ready');
      } catch (error: any) {
        if (cancelled) return;
        // The server distinguishes "we cannot verify this" from "you have not
        // started a claim yet", and both are things the claimant can act on.
        setMessage(
          error?.response?.data?.message ??
            'We could not open your claim from here. Please go back to the chat and try again.'
        );
        setStatus('refused');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  if (status === 'verifying') {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {status === 'unavailable'
            ? 'Please open this form from the chat in Telegram.'
            : message}
        </p>
      </div>
    );
  }

  return <PublicChatPage />;
}
