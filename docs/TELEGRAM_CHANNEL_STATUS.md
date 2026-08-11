# Claimant Telegram channel — current status

> ⏳ **This file is temporary. Delete it once the issues below are fixed.**
>
> It is a work queue for one remediation push, not a description of the
> system. Left behind once empty it would become the stalest file in `docs/` —
> the §3.6 false-comfort pattern in a new coat. On deletion, also remove its
> two pointers (`CLAUDE.md`'s supporting-documents list, and the
> `MASTER_PLAN.md` §8 entry that introduces it), and first move anything
> durable — the operating notes in §6, above all the singleton-poller footgun
> — into `USER_FLOWS.md` or `NON_MOTOR_ARCHITECTURE.md` rather than losing it
> with the file.

**As at 11 August 2026.** Keep this current when the channel changes; it is the
answer to "can a claimant actually use this yet?", which the roadmap in
`MASTER_PLAN.md` §5 does not answer at the level of one channel.

> **Verdict today: a claimant can complete a claim.** Tier 1 is empty as of
> 11 August — intake works end to end on all five flows, and an operator can
> take over, read the transcript and open the evidence. What is left is
> compliance (Tier 2) and the unhappy paths (Tiers 3–6).
>
> **Still synthetic and internal-tester data only**, because Tier 2 is not
> optional: no cross-border transfer record is written for any turn, and the
> consent notice is shown in English only.

References are by file and symbol rather than line, because line numbers rot
faster than the code they point at.

---

## 1. What the channel is

One conversational intake, shared with web chat, driven by the same flow
definitions and the same write path:

```
Telegram ─┐
Web chat ─┼─► ConversationGateway ─► CasesService.patchAnswer ─► Case
FNOL mail ┘        (per-turn state)      (validation, redaction,
                                          policy match, audit)
```

- **Ingress** is long-polling (`chat/telegram/telegram.poller.ts`), so there is
  no public surface and local development needs no tunnel.
- **Everything channel-specific** sits behind `ChannelAdapter`; everything
  claim-specific behind `CasesService`. Telegram is currently the only
  registered adapter (`chat/chat.module.ts`).
- **Five travel flows** — flight delay, luggage damage, luggage loss, trip
  cancellation, medical — held as data in `FlowDefinition`, pinned per Case at
  creation so publishing an edit cannot rewrite an intake in flight.
- **The claimant journey**: share contact → consent notice → claim type → the
  flow's questions → documents → review → submit. No one-time code: binding
  rests on Telegram confirming the shared number is the *sender's own*
  (MASTER_PLAN §6 item 20).

---

## 2. Status at a glance

| Area | State |
|---|---|
| Ingress, idempotency, dedupe | ✅ Working |
| Identity binding | ✅ Verified contact, no OTP (11 Aug) |
| Consent capture | ✅ Working, in the claimant's language (11 Aug) |
| Question/answer loop | ✅ Working |
| Answer correction (back/edit) | ✅ Working (11 Aug) |
| Document upload | ✅ Working, optional steps skippable (11 Aug) |
| Review and submit | ✅ Working |
| Human takeover | ✅ Working; bot cannot speak over an agent (11 Aug) |
| Operator transcript | ✅ Working (fixed 11 Aug) |
| Cross-border transfer record | ✅ Written per turn, honest null basis (11 Aug) |

---

## 3. What is built and verified working

Verified by running it, not by reading it.

- **The poll loop.** Monotonic offset advanced before handling, per-update
  error isolation so one bad message cannot kill the loop, 5s backoff, an HTTP
  timeout longer than the long poll, `allowed_updates` scoping, clean shutdown.
- **Idempotency.** Insert-first on `(channel, platformMessageId)` with the
  unique violation *as* the "already seen" branch, so the database arbitrates
  and a platform retry cannot double-answer.
- **One write path.** Answers route through `CasesService.patchAnswer`, the
  same method the PWA calls, which carries validation, sensitive-answer
  masking, policy promotion, deadline warnings and the audit row. A Telegram
  sender provably cannot reach another claimant's Case: `assertAccess` is the
  same code the browser passes through.
- **No cross-claimant data path.** Four independent auditors and a manual read
  looked for one and none was found.
- **Plain text only.** No `parse_mode` is ever set, so the classic Telegram
  escaping failure (an underscore in a flight number producing a 400) cannot
  occur.
- **Version pinning.** `FlowsService.forCase` honours the pinned definition and
  logs loudly rather than silently falling back.
- **Day-first dates.** `parseTextDate` reads `06/08/2026` as 6 August with a
  round-trip check, and `validateAnswer` refuses slash dates outright rather
  than handing them to `new Date()`.
- **Consent is a precondition in code, not a flow step.** `CasesService.create`
  refuses without a live `CLAIM_PROCESSING` consent, so no channel can open a
  Case around the gate, and intake is refused outright when no notice is
  approved.
- **Document upload works** end to end — lazy media reference, fetched only
  when a document step wants it, then the PWA's own upload path with
  supersession of an earlier file at the same step.
- **Handover stands the bot down** completely; tenant scoping holds on both the
  inbox and the send path.

---

## 4. Pending

### Tier 1 — a claimant cannot finish

**Empty as of 11 August 2026.** All five closed: OTP delivery (replaced by
verified-contact binding), the payout-account destruction, the double-tap
corruption, unskippable optional documents, and handover take-over. See §5.

A claimant can now complete an intake end to end on every one of the five
flows, and an operator can pick up, read and act on it. What remains is Tiers
2–6: compliance obligations, the unhappy paths, and friction.

### Tier 2 — compliance

**Closed 11 August 2026.** Every turn now writes a `TransferRecord`; the
consent notice and the flow's wording follow the claimant's own language; and
the transcript no longer keeps a plaintext payout account. See §5.

**What remains open, and is a decision rather than a defect:** those transfer
records carry `lawfulBasis: null`, because no s.129 basis is established for
this channel. The register is honest about the gap rather than papering over
it — but the gap is real, and it is what still keeps this channel on synthetic
and internal-tester data (MASTER_PLAN §3.4, §6.3).

One residual worth naming: the transcript survives claimant anonymisation.
Masking the payout account removes the acute exposure, but a claimant's own
words — names, addresses, circumstances — remain after the identity they
belong to has been destroyed. That is a retention-design question, tracked in
§3.4 rather than here.

### Tier 3 — wrong data, silently

**Closed 11 August 2026**, in two passes. The first closed the six items
listed here. A re-audit against the original reports then found the *tiering*
had been incomplete — several findings had never been transcribed into any
tier — and four more belonged in this one. Those are closed too; see §5.

The lesson is worth more than the fixes: the tracker was accurate about what
it listed and silent about what it omitted, which is the §3.6 pattern one
level up. A summary of an audit is not the audit.

### Tier 4 — silent loss and operations

**Closed 11 August 2026.** All eight: unreadable message kinds, photo
captions, `/start` mid-flow, turns recorded and abandoned, a database outage
losing the message, no HTTP timeout, no 429 handling, oversized files, and
409/401 retrying forever. See §5.

One thing deliberately *not* done: a stalled turn is marked failed, never
replayed. Re-running a half-finished turn risks repeating whichever part did
complete, and the honest outcome is to make the loss visible rather than
guess at recovering it.

### Tier 5 — privacy and access

**Closed 11 August 2026.** Group chats refused before a binding exists; the
Case access-checked before any of it is read; consent re-checked every turn;
bindings that expire after 90 days and can be revoked outright; and both paths
where the bot could speak over an agent. See §5.

### Tier 6 — friction, latent risks, documentation

**Closed 11 August 2026.** The publish gate's four holes plus a fifth
(`callback_data` length); `"skip"` reading as a literal in the review; the
`Policy` re-query on every turn; the poller's dangling shutdown promise and
its complete absence of tests; the reply keyboard left pinned; typing instead
of tapping at both entry gates; `help` disappearing into an empty queue; the
progress counter blinking in and out; a review summary truncated mid-line;
consent with no way to decline; and the documentation.

---

## 5. Recently closed

| Date | Change |
|---|---|
| 11 Aug 2026 | **Evidence can be looked at.** `GET /cases/:id/documents` and `…/:documentId/content` — staff-only, tenant-scoped, audited as a sensitive read. Case documents had no read path at all, so an operator was vetting evidence they could not see. Telegram attachments now render in the transcript. |
| 11 Aug 2026 | **Tapped answers reach the transcript.** Every button press stored NULL and rendered "—"; `callbackValue` is now persisted and resolved to the label the claimant saw. |
| 11 Aug 2026 | Telegram uploads were all stored `application/octet-stream`; the type is now derived from the extension, 13 rows backfilled. |
| 10 Aug 2026 | Telegram polling made opt-in (`TELEGRAM_POLLING_ENABLED=true`) — it is a fleet-wide singleton and a default-on second instance halves the first. |
| 10 Aug 2026 | `TELEGRAM` added to `OFFSHORE_PROVIDERS` so its transfers are *recordable* — writing them is still pending (Tier 2). |
| 11 Aug 2026 | **Tier 6 closed.** The publish gate now refuses the four shapes it used to wave through — a cycle reachable only down a branch's `else` or a non-first switch case (it followed the first arm only, and the first arm is the one an author walks by hand), a switch with no default or a branch arm pointing nowhere, an empty prompt, and a validation pattern that will not compile — plus a step id too long to carry its own value in a tapped button. `help` explains and repeats the question instead of handing over into what, out of hours, is indefinite silence; `human` still reaches a person. Typing at the claim-type and consent gates says what is wrong rather than resending the same menu forever. Consent offers a decline. A long review is split rather than clipped mid-line, so nobody confirms details they were not shown. The reply keyboard is retired once the number is in; the progress counter appears on every ask, not only the forward path; `"skip"` reads as "not provided"; the `Policy` lookup runs when the policy number changes rather than on all eighteen turns; the poller settles its pause on shutdown and — for the first time — has tests, over the offset arithmetic, error isolation, rewind and the 401 stop. `USER_FLOWS.md` gains §9b. |
| 11 Aug 2026 | **Tier 5 closed.** A group chat is refused before any binding exists — the platform id there identifies the *group*, so one binding would have put a claimant's case number, answers and deadline warnings in front of everyone in it. The Case is access-checked the moment it is loaded, through the same `assertAccess` the browser passes, rather than relying on `activeCaseId` never being wrong. Consent is re-checked every turn, so a withdrawal in the PWA now stops collection here instead of being faithfully recorded and ignored. A binding expires after 90 days — it was an indefinite credential, written once and never read — and `POST /conversations/:id/unbind` can revoke one outright, firm-admin only, with a mandatory reason on the audit row. The two paths where the bot could still speak over an agent are closed: the handover check now precedes onboarding, and the error-path apology asks first. |
| 11 Aug 2026 | **Tier 4 closed.** A voice note, video, sticker or location is now named and refused instead of vanishing with no row, no reply and no trace; a photo's caption is read as the answer it is. `/start` mid-flow re-asks rather than being stored as the answer. A turn the database refused is left *unacknowledged* so Telegram redelivers it — losing a claimant's message to a transient outage was the worst of the silent failures — and turns recorded but abandoned are swept into view every five minutes rather than sitting PENDING forever. The chat HTTP client finally has a timeout: the poll loop is strictly serial, so one black-holed connection froze the channel for everyone until TCP keepalive. 429 is honoured with its own `retry_after` instead of failing the turn. A file over 20 MB is explained rather than reported as our fault. 409 names the second poller it proves, and 401 stops rather than retrying a revoked token forever. |
| 11 Aug 2026 | **Tier 3 re-audit — four more, and a weakness in one of the fixes.** Re-reading the original reports found findings that had never reached any tier. `normalisePhone` prefixed `+` only for Malaysian numbers, so a foreign one was stored as bare digits — two shapes in one column, on the one line whose claimants are by definition abroad, risking a duplicate Claimant whose Telegram and PWA claims never join up. The DTO behind it refused foreign numbers outright, so such a claimant could not bind at all. A stale `resumeStepId` still persisted a cursor pointing at no step. Editing a branch input left documents attached to a path the claim no longer takes. And the earlier `!nextStep` fix had used `answerType === 'confirm'` as a proxy for "this is the review" — the medical flow has *two* confirm steps and proves the two are not the same thing, so `isReview` is now explicit and the answer summary no longer lands under a specialist-review notice. |
| 11 Aug 2026 | **Tier 3 closed.** `back` walks to a step the claimant actually answered, instead of the previous one in declaration order — on a branched flow that had been reopening a mandatory medical report the branch deliberately skipped. A question whose send failed is re-asked rather than having the next message stored as its answer. Running out of steps anywhere but a review hands to an agent instead of submitting an incomplete case and telling the claimant it is "with our team". `parseAmount` replaces `Number()`, so a blank message no longer records RM 0 and `RM1,200` is finally readable. A future incident date is refused, because it silently suppressed the very CSP flags it should raise. The Case channel comes from the turn rather than being hardcoded TELEGRAM. |
| 11 Aug 2026 | **Tier 2 closed.** Every conversational turn writes a `TransferRecord` — the registry entry and its passing test had existed for a day while nothing wrote a row, the §3.6 shape inside the control added to close that very gap. `transferRecord` moved from the `assessment` context to a new cross-cutting `compliance` one: a s.129 register is evidence about the platform's own behaviour, and whoever makes the offshore call must be the one who records it. Telegram's `language_code` now drives both the consent notice and the flow's wording, so the approved Malay notice is finally shown to somebody; the overlay resolver has its first runtime caller. The transcript masks the payout account the claimant typed. |
| 11 Aug 2026 | **Tier 1 closed.** A tapped button is acknowledged so it stops spinning, and its `callback_data` now names the step it was rendered for — a tap arriving after the conversation moved on is re-asked instead of being applied to the next question, which is what stored the claim type as the policy number. Optional document steps accept `skip`, so the luggage flow can reach review. Handover take-over no longer refuses every agent on a conversation nobody holds. |
| 11 Aug 2026 | **The payout account survives the conversation.** `promoteAnswers` was re-encrypting the display mask over the real ciphertext on every turn after the one that supplied it; `lastDigits` strips the bullets, so every screen and the audited reveal read correctly while holding a mask. Affected every claim on every channel. **5 of 7 stored accounts on the demo book were already destroyed** — unrecoverable, the plaintext lives only in that column. |
| 11 Aug 2026 | **Binding no longer uses an OTP.** A shared contact is accepted only when Telegram says it is the *sender's own* (`contact.user_id` matched against the sender) — a check that did not exist, and without which sharing a victim's contact card bound you as them. The typed-number path is removed, and a 20-turn-per-minute limit replaces identity as the answer to the realistic attack, which is volume. Decision and its reversal condition: MASTER_PLAN §6 item 20. |
| 10 Aug 2026 | The hardcoded `123123` OTP bypass removed; codes now come from a CSPRNG. |

---

## 6. Operating it

| Setting | Effect |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Unset ⇒ the channel is off entirely. |
| `TELEGRAM_POLLING_ENABLED` | Must be `true` on **exactly one** instance per bot token. Two pollers each receive half the updates, which presents as claimants being intermittently ignored rather than as an outage. Staging needs its own bot. |
| `CHAT_LLM_NORMALISER_ENABLED` | Off by default. Fallback-only interpretation of an answer that failed deterministic parsing; the model returns a value, never a decision, and every call writes a `TransferRecord` with no lawful basis. |

**Binding in development:** tap *Share my number* in Telegram. No code is sent
and a typed number is refused — the button is the only way in, by design. The
PWA still logs in by OTP, which prints to the gateway console.

---

## 7. How this was audited

The findings above came from a four-way parallel audit on 10 August 2026 —
transport, flow engine, security/privacy, and documentation — plus a manual
read of the gateway and empirical probes against the real flow definitions and
the live database.

Two observations worth carrying forward:

1. **Everything material was found by running the system**, not by reasoning
   about the code — the same lesson `MASTER_PLAN.md` §3.6 records.
2. **The two defects fixed on 11 August were both found by a person using the
   screen**, not by the audit that had just read the same code closely. An
   audit narrows the search; it does not replace using the thing.

---

*Related: `MASTER_PLAN.md` §3.4 (cross-border transfer), §6.3 and §6.18–6.19
(the LLM normaliser and its open questions), `docs/USER_FLOWS.md` §3 (the
intake state machine), `docs/NON_MOTOR_ARCHITECTURE.md` (the channel-adapter
split).*
