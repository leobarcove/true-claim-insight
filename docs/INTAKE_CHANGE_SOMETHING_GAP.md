# Gap: “Change something” shows no options and no typing

**Status:** closed (2 September 2026)  
**Found:** 28 August 2026, local `/chat` review step  
**Screenshot:** [gaps.html](./gaps.html#g2) · [standalone page](./intake-change-something-gap.html)

## Symptom

At the review card, tapping **Change something** (transcript label: *Asked to change something*) replies:

> Which detail would you like to change?

The composer then stays on the review controls: **Confirm and submit** and **Change something**. There is no list of fields to pick, and no text box to type which detail. Tapping **Change something** again repeats the same pair of bubbles.

## What the backend already does

`ConversationGateway.offerEditMenu` builds a synthetic choice step `__edit-menu` (one button per answered field) and sends *Which detail would you like to change?* with those choices.

Telegram / WhatsApp render that step as a keyboard. The web transcript GET does not.

Once a Case exists, `ClaimantConversationService.openQuestion` sets `currentStep` from `case.currentStepId` only. After *Change something*, that id is still the review `confirm` step. `__edit-menu` is not in `synthesiseStep` (`__consent`, `__claim-type`, `__another-claim` are).

The PWA therefore keeps `AnswerControl` on `confirm`: two buttons, no typed input (`apps/claimant-web/src/pages/cases/new.tsx`).

## Close when

After **Change something**, web chat `currentStep` is `__edit-menu` (or equivalent) with the field choices, **or** a text box is shown so the claimant can name a field. Review buttons must not remain the only composer.

## Resolution

`ClaimantConversationService.openQuestion` now checks the most recent outbound
question when it differs from the Case cursor. For `__edit-menu`, it passes the
pinned flow and current answers to `ConversationGateway.synthesiseStep`, which
rebuilds the same choices used by push channels. The web transcript therefore
returns `currentStep.id === '__edit-menu'`, and the PWA renders a choice control
instead of the review buttons.
