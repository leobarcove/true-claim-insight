import { Injectable, Logger } from '@nestjs/common';

/**
 * In-process fan-out for "a case was returned to the claimant".
 *
 * Exists to break a module cycle without inventing infrastructure. The chat
 * gateway already depends on CasesModule; telling the claimant on their own
 * channel means the cases side must now reach the gateway — and a direct
 * injection would make the two modules import each other. So the cases side
 * emits into this provider and the gateway subscribes at startup: the same
 * inversion the chat module already practises with its ports, one file
 * instead of an event-bus dependency.
 *
 * Listeners are fail-soft by construction: a channel push that throws is
 * logged and swallowed, because failing the operator's vetting action over an
 * undeliverable courtesy message would invert their importance.
 */
@Injectable()
export class InfoRequestEvents {
  private readonly logger = new Logger(InfoRequestEvents.name);
  private readonly listeners: Array<(caseId: string) => Promise<void>> = [];

  on(listener: (caseId: string) => Promise<void>): void {
    this.listeners.push(listener);
  }

  emit(caseId: string): void {
    for (const listener of this.listeners) {
      void listener(caseId).catch(error =>
        this.logger.error(
          `Info-request listener failed for case ${caseId}: ${(error as Error).message}`
        )
      );
    }
  }
}
