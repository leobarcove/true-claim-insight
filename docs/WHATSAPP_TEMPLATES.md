# WhatsApp message templates

Templates exist for one reason: WhatsApp's **24-hour service window**. It runs
from the claimant's own last message. Inside it the platform carries whatever
we write, free-form and free of charge. Outside it Meta refuses free-form text
(error `131047`) and only a template it has approved gets through.

That distinction decides which of our messages needs a template at all. Most do
not — the intake conversation is a reply to something the claimant just sent.
Two do, because both are business-initiated by definition:

| Template | Env var | Category | Why it must be a template |
| --- | --- | --- | --- |
| Login code | `WHATSAPP_OTP_TEMPLATE` | AUTHENTICATION | The claimant has not messaged us yet — there is no window |
| Information request | `WHATSAPP_INFO_REQUEST_TEMPLATE` | UTILITY | An operator returns a case; the claimant may have been silent for days, which is precisely who a request is for |

**Status:** `tci_claim_information_request` was **approved by Meta on 18 August
2026** and is configured on this deployment. The paragraphs below remain the
record of what was submitted and why — needed again for a Malay variant, or if
Meta ever asks for the template to be re-justified.

Both are **absent by default**. Unset, the platform simply does not send that
message: the login code falls back to its other transport, and the information
request waits for the claimant's next message (the conversation resumes it
lazily). Nothing breaks and nothing is silently lost.

## Submitting the information-request template

In **WhatsApp Manager → Message templates → Create template**:

1. **Category: Utility.** Not Marketing — this concerns a claim the claimant
   themselves opened, which is what Utility means and what keeps the message
   deliverable at the utility rate. Choosing Marketing invites rejection and
   costs more when it does not.
2. **Type: Default** (plain body text). Not Flows, not Calling permissions.
3. **Name:** `tci_claim_information_request` — the `tci_` prefix matches
   `tci_login_code`, so the WABA's templates are identifiable at a glance when
   it carries more than one product's.
4. **Language:** English. Add a Malay version later under the same name — Meta
   treats locales as variants of one template, and `WHATSAPP_TEMPLATE_LOCALE`
   selects which is sent.

**Body** — exactly two variables, in this order:

```
Hello. We need one more thing on your claim request {{1}} before we can
continue: {{2}}

Reply to this message and we will pick up where you left off.
```

**Sample values** for Meta's review (they reject templates whose variables have
no examples):

- `{{1}}` → `CSE-2026-000031`
- `{{2}}` → `Please upload your boarding pass`

**Footer** (optional, recommended): `True Claim Insight`

**No buttons.** A reply is the action, and the conversation is already the
place it happens.

### Why this wording

- It names the case, so a claimant with more than one knows which.
- It carries the operator's own ask verbatim as `{{2}}` — the same words the
  portal recorded and the email sent, so the claimant is never asked two
  differently-worded questions about one thing.
- It says what to do in one sentence, and that action re-opens the service
  window, after which the ordinary conversation takes over at no cost.
- It states no deadline and threatens no closure. Abandonment is a decision a
  person takes later, with its own notice.

## After approval

Set both variables and restart the service:

```
WHATSAPP_INFO_REQUEST_TEMPLATE=tci_claim_information_request
WHATSAPP_TEMPLATE_LOCALE=en
```

The gateway spends the template **only when the ordinary push was refused** —
never when the free-form message went through, so an in-window claimant costs
nothing. A template that does send is written into the conversation transcript
like any other outbound message: it is still the firm's word to the claimant,
and the operator inbox must show it.

## Cost note

Meta bills utility templates per message, and rates are regional. Register the
WhatsApp Business Account **in Malaysia**: an account registered elsewhere is
billed at the international rate for the same message to the same Malaysian
number (the login-code note in `.env.example` records the same trap).
