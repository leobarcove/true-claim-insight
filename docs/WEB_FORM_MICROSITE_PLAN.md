# Web-form microsite — implementation plan

**Status:** decisions settled 28 August 2026. Not started.
**What we are building:** a claim form at `/form` on claimant-web — a fourth way to lodge a claim, alongside the web chat, WhatsApp and Telegram. Desktop first, works in a phone browser. No app.
**Design:** 22 approved screens — start · code · consent · six form sections · submitted · handover, each in a desktop and a phone-browser version. Source in `docs/assets/web-form/` (commit `gen.mjs` there when work starts).

---

## 1. How it works — read this before anything else

**The form is a new face on the existing chat conversation. It is not a new intake.**

Everything about a claim already lives in one engine: the server holds the questions, decides what comes next, and stores the answers. The chat asks one question at a time. The form shows six or so at once — but underneath, it sends them to the server **one at a time**, in the order the server expects.

**Do not assume the Telegram Mini App is a precedent for this.** It isn't — `telegram.tsx` renders `PublicChatPage`, so the Mini App *is* the chat in a webview, one question at a time. Nothing in the codebase shows many fields at once. The part of this project with no precedent is the submit engine (§2.5); everything else follows an existing path closely.

Two hard rules follow:

1. **No new way to save an answer.** Every answer goes through `POST /api/v1/public/conversation/turn`, the same as chat. That path is where redaction, policy matching, deadline tracking, audit rows and access checks live. A shortcut around it loses all of them.
2. **The server decides the order, not the form.** The server tracks `currentStepId` and rejects an answer aimed at a different step. So the form submits a section field by field, in path order, and stops at the first refusal.

The only thing missing is a way to *read* the whole picture at once, for a visitor who is not logged in. Logged-in claimants already have it — that is the one new endpoint in Phase 1, and it copies the existing pair rather than inventing a shape.

The payoff: anything the chat learns (a new claim type, new wording, a new document) appears on the form with no form code written.

### Things that look like bugs but are correct — leave them

- **The review step's bot message repeats all the answers as text.** That is for the chat, which has nowhere else to show them. The form draws its own review page and never renders bot messages as prose, so it is invisible there. Do not change the setting that causes it.
- **One answer per request.** The turn payload takes a single answer and the validator rejects extra fields. That is deliberate — see rule 1 above.
- **Submitting does not create a Claim.** It creates a submitted *claim request*; a staff member converts it later. Keep the wording "claim request" on the review and submitted pages.
- **The transcript never returns a document id.** Only a "has attachment" flag. The new endpoint adds a filename, and nothing more.

---

## 2. Decisions already made

| | Question | Decision |
|---|---|---|
| **D1** | Its own channel, or share with the web chat? | **Share.** `/form` and `/chat` are one conversation and one claim, so someone can start on the form and finish in the chat with nothing retyped. Each message is tagged with which surface it came from. |
| **D2** | How do we know which insurer? | **From the policy number**, as today. Per-insurer branding and web addresses come later. |
| **D3** | How does the code reach the claimant? | **WhatsApp.** There is no SMS anywhere in the system. Fine for the pilot; SMS is a launch gate (§7). |
| **D4** | Captcha on "Send code"? | **Not for the pilot.** It is a launch gate (§7). |
| **D5** | Malay? | **Ship English.** The language switch works, but no Malay wording exists for the questions yet. Translating them is a separate job. |

Two of these need a note, because they are easy to get wrong later:

- **D1** — splitting the channel would *not* have given a cleaner chat log. The form writes chat-style messages either way; that is how the engine records an answer. Splitting would only move them to a second thread, and would leave anyone who switched surfaces with two claims to merge by hand. The surface tag is what actually solves it.
- **D3** — a claimant without WhatsApp cannot use the site at all. Say "WhatsApp" in the copy, never "we text you".

---

## 3. Must be fixed before anything goes live

Not form work, but a public form makes each of these visible to claimants.

| | Problem | Fix | Where |
|---|---|---|---|
| **B1** | On a fresh database, consent notices are unapproved, so **all intake is blocked** — chat included. The approval endpoint exists but is unreachable: not proxied, no screen. | Proxy `POST /api/v1/consent/notice/:purpose/:version/approve` through the gateway; add a one-screen approval page for `COMPLIANCE_OFFICER` / `FIRM_ADMIN`. | api-gateway; adjuster-portal. See `docs/PDPA_NOTICE_APPROVAL_GAP.md`. |
| **B2** | Uploads accept **any** file type. The only check today is the browser's `accept` attribute, which anyone can bypass. | Allowlist `image/jpeg, image/png, image/webp, image/heic, application/pdf` plus a magic-byte check before storing. | `apps/case-service/src/cases/cases.service.ts` (`uploadDocument`) |
| **B3** | Without `HANDLING_FIRM_TENANT_ID`, creating a claim fails with "No handling organisation is configured". | Set it per environment. | env |
| **B4** | With no WhatsApp OTP settings, production **silently never delivers a code** — on every channel. | Fail at boot instead: require the three `WHATSAPP_*` settings when `NODE_ENV=production`. | `apps/api-gateway/src/auth/` |
| **B5** | A claimant who stops halfway and comes back **on a different channel gets a brand-new claim**. Their unfinished one becomes unreachable to them and sits in the staff queue as a duplicate. Live today between the web chat and WhatsApp; the form adds another entry point, so fix it first. | The resume machinery already exists — `resumeReturnedCase` finds the first unanswered step, attaches the case to the new conversation and asks them to carry on; one match resumes automatically, several show a chooser. It simply never sees drafts. **Widen the filter** from `status: CaseStatus.INFO_REQUESTED` to `status: { in: [DRAFT, IN_PROGRESS, INFO_REQUESTED] }`. Then: branch the copy, because "Our team needs one more thing" is wrong for a draft — say "You have an unfinished claim request TC-…. Shall we carry on?"; fall back to claim type and date in the chooser labels where there is no `reviewNote`; rename `returned` → `resumable` and `resumeReturnedCase` → `resumeCase`. **Change nothing else** — no time window, tenant filter as is, and the old conversation keeps its stale pointer, all exactly as returned cases behave today. | `conversation.gateway.ts` ~1233 (filter), ~494–545 (copy); tests alongside the existing resume cases in `conversation.gateway.spec.ts` |

---

## 4. Build order

### Phase 0 — clear the blockers · 2–3 days

Do B1–B5 above.

**Done when:** a fresh database can pass the consent gate through the portal (not a manual database edit), a missing OTP transport stops the service at boot rather than at a claimant, and a claimant with an unfinished claim on one channel is offered it on another instead of being given a new one.

---

### Phase 1 — backend · 3–4 days

**1.1 New endpoint: `GET /api/v1/public/conversation/state`**

Logged-in claimants already get everything the form needs, from two endpoints that exist today:

- `GET /cases/:id` — case detail with documents, checklist and flow state
- `GET /cases/:id/flow` — the full pinned flow, described in its own docs as *"fetched once per case by the claimant app to rebuild the transcript and render each step"*

A public visitor has no case id and no login, so they cannot call either. **Mirror them for the public session**, returning the same two payloads the authenticated app already receives:

```ts
{
  stage: 'phone' | 'code' | 'consent' | 'claim-type' | 'flow' | 'submitted' | 'handover';
  locale: 'en' | 'ms';
  consent?: { title: string; body: string; version: number };  // stage === 'consent'
  claimTypes?: FlowStep['choices'];                            // stage === 'claim-type'
  case?: CaseDetail;   // same shape as GET /cases/:id  — answers, documents, currentStepId
  flow?: CaseFlow;     // same shape as GET /cases/:id/flow — dressed for locale
  lastReply: string | null;   // the bot's most recent message — the form's error text
}
```

- **Reuse the existing service methods** (`findOne`, `getFlowForCase`) with the case resolved from the session rather than a URL parameter. Do not write new serialisation.
- **The form works out its own path.** `@tci/shared-types` is already imported by claimant-web and carries the branching helpers, so the client walks the flow against the answers exactly as the server would. No path-walking endpoint, no second description of a flow.
- `stage` is derived from the conversation: `pendingPhone` set → `code`; no claimant → `phone`; no case yet → whichever pre-claim question was last asked; handover mode → `handover`; case submitted → `submitted`.
- Documents: expose **filename and time only**, never the document id or a URL. Add a test asserting the id is absent.
- Same session header and throttle class as the existing `GET /api/v1/public/conversation`.

**1.2 Tag each message with its surface**

- Add `surface?: 'chat' | 'form' | 'miniapp'` to `ClaimantTurnDto` (it must be whitelisted — the validator rejects unknown fields).
- Add a nullable `surface` string column to `ConversationMessage`. A plain string, not an enum, so a fourth surface needs no migration.
- Write it where the inbound message row is created in `conversation.gateway.ts`.
- Show it as a small badge in the portal thread (`MessageThread`).

This is the one place the plan goes beyond what an existing channel does — the Mini App does not tag its turns. Kept deliberately, because staff read one thread for both surfaces. Without the tag they cannot tell a claimant's own words from a tapped option, and — most importantly — an operator who takes over cannot tell that a claimant sitting on the form **will not see their reply** until they move to the chat. It also makes "do more people finish on the form or the chat?" answerable. Do it now: rows created before the column exists can never be classified.

**1.3 Three small fixes**

| Fix | Where | Why |
|---|---|---|
| Send `locale` on every turn, not only at `start` | `apps/claimant-web/src/hooks/use-public-conversation.ts` (`useSendPublicTurn`) | Otherwise the language switch does nothing after the first message. |
| Record consent as `ConsentChannel.WEB_FORM` when `surface === 'form'` | `conversation.gateway.ts` (~line 2086) | Today every channel records `MESSAGING`. The right enum value already exists. |
| Teach `synthesiseStep` about `__edit-menu` | `conversation.gateway.ts` (~line 2201) | Closes `docs/INTAKE_CHANGE_SOMETHING_GAP.md` for the chat. The form does not need the menu, but the chat must not strand people. |

**Done when:** `GET …/state` returns correctly at every stage, and the existing chat test suite still passes.

---

### Phase 2 — the form itself · 6–8 days

**2.1 Grouping questions into sections** — `apps/claimant-web/src/pages/form/sections.ts`

An explicit map from step id to section. Five flows, about twenty step ids between them:

| Section | Step ids |
|---|---|
| Claim type | the pre-claim `__claim-type` question |
| You & your trip | `claimant-name`, `policy-number`, `trip-start`, `trip-end`, `destination`, `incident-date` |
| What happened | the per-type questions — airline, flight number, departures, baggage tag, descriptions, amounts, cancellation reason, treatment country, hospital |
| Evidence | every `answerType: 'document'` step, plus the medical specialist notice that follows them |
| Payout | `bank-name`, `bank-account-number`, `bank-account-holder` |
| Review | the step flagged `isReview` |

**Fallback:** anything unrecognised goes to *What happened*, so a step the map has not heard of still renders instead of vanishing.

This lives in claimant-web, not shared-types — only the form uses it. It is a plain map rather than a rule engine because there is no flow editor UI, so no one can currently produce a flow with renamed steps. Revisit if that changes; the fallback holds the line until then.

Alongside it, `sectionsFor(flow, answers)` returns the six sections with their steps, whether each is complete, and the first incomplete one — driving the progress bar, the section list, and where someone lands when they return.

**2.2 Field controls** — one control per `answerType`

text · date (native picker, shown dd/mm/yyyy) · datetime · number (RM prefix, numeric keypad) · choice (radio cards up to 6, searchable list above that; `allowOther` accepts typed text) · phone · document (drop zone on desktop, camera on phone) · confirm (card with one action).

This is `AnswerControl` from `apps/claimant-web/src/pages/cases/new.tsx`, reshaped for a form. Keep it in claimant-web for now.

**2.3 Route, layout and the furniture on every page**

- Register `/form` as a public route in `App.tsx`.
- Every page is currently wrapped in a fixed 430 px phone frame. `/form` needs the full-width site layout instead — add a `layout` option to the route wrapper rather than building a second app shell.
- No service-worker change needed. While in there, fix `manifest.theme_color` (`#2563eb`) to match `index.html` (`#0b754e`).

Every page in the design carries the same frame. Build it once:

| Part | Desktop (≥1024px) | Phone browser |
|---|---|---|
| Header | Logo, claim reference once one exists, EN · BM switch | Same, condensed, with a menu button |
| Left | **Section list** — the six sections, ticked as they complete, current one highlighted | Replaced by a **"Step 3 of 6 · What happened"** bar with a progress line |
| Centre | The form | The form, single column — two-column field grids stack |
| Right | **Summary rail — "Your claim so far"** | Not shown; the Review page serves the purpose |
| Bottom | Back / Continue, right-aligned | Back / Continue pinned to the bottom of the screen |
| Footer | One line: data handled under the PDPA notice, parts of the assessment use AI, a person decides | Same, wrapped |

The **summary rail** lists the answers captured so far, newest section last, and closes with "Saved after each step. Come back any time with the same mobile number." It reads straight from the case payload — no separate state. This is the summary panel the channel settings record as declared-but-never-built; once it renders, that flag can honestly be turned on for this surface.

The three pre-claim pages (Start, Code, Consent) have **no section list and no rail** — no claim exists yet, so there is nothing to show and no sections to list.

**2.4 The pages**

| Page | Shown when `stage` is | What it does |
|---|---|---|
| Start | `phone` | Number field → `POST start`, then a text turn with the number. Copy says the code arrives **on WhatsApp**, and that entering the same number again picks up an unfinished claim. Beside it (below it on a phone) a **"Have these ready"** card: policy number · passport or IC · boarding pass or itinerary · airline letter, police report or receipts · bank account. Static text, but it is what stops people abandoning at the Evidence step. |
| Code | `code` | Six boxes → text turn with the digits. Wrong code shows `lastReply`; after five tries the server resets to `phone`. |
| Consent | `consent` | Show `consent.body` **exactly as returned**. Agree → `callbackValue: '__consent:agree'`. Decline → `'__consent:decline'` and a closing screen. |
| 1 Claim type | `claim-type` | Cards from `claimTypes`; send the chosen value as `callbackValue`. |
| 2–5 | `flow` | Sections from `sectionsFor`. |
| 6 Review | `flow` | All answers grouped by section. **Change** sends `__edit:<stepId>`, the field opens inline, the answer is sent, then re-read `state`. **Submit** sends `callbackValue: 'true'` on the review step. |
| Submitted | `submitted` | Claim reference, anything still outstanding, and three plain lines on what happens next. **No "Track this claim" and no PDF download** — decided 28 Aug; both were on the first draft of the design and both promise something out of scope. Removed from the design too. |
| Handover | `handover` | No sections, no rail. "One of our team is handling this", an explanation that their colleague's reply arrives in the message view rather than on the form, and an **Open messages** button to `/chat`. |

**2.5 The submit engine** — the only tricky part

When someone presses Continue on a section:

1. Work out which fields changed, in path order.
2. For each one: if the server's `currentStepId` is not this step, send `__edit:<stepId>` first; then send the answer with `callbackStepId` set. For documents, upload the file first, then send a turn carrying `storedDocumentId`. Skip sends the text `'skip'`; "add later" sends `'later'`.
3. After each turn the response contains the updated conversation — read `currentStepId` from it. If it did not move on, the bot's last message is the reason: show it under that field and stop, leaving the rest unsent.
4. When the section is clean, re-read `state` and go to the first incomplete section.

Give each attempt a stable `clientMessageId` so a retry is safe. Unsent values live in component state only, so a refresh mid-section simply reloads from the server. Branch changes are handled by the server already — just re-read `state` and trust it.

**2.6 Three traps that come with sharing one conversation**

Trap 1 is the one that will actually bite. Traps 2 and 3 are cheap notes, listed so nobody rediscovers them as bugs.

**Trap 1 — the form talks too fast.** The server drops any message beyond **20 per minute** per conversation (`conversation.gateway.ts:785–802`). The message is marked failed and **thrown away**, not queued, and only the first refusal gets a reply. Chat never hits this because people type slowly; the form sends a whole section in one burst. A flight-delay claim is 6 + 4 + 3 + 3 turns across the sections, plus **2 per correction** at review — someone moving quickly, or a tester using autofill, crosses 20 easily.

*Handling:* step 3 above would treat this as a field error and blame a field that was perfectly fine. Detect the rate-limit reply specifically, wait, and retry the same `clientMessageId`. Also propose raising the cap — 20 a minute was sized for a human typing.

**Trap 2 — two tabs.** Both share one `currentStepId`. Nothing corrupts — the server checks which step an answer is for. *Handling:* none. The chat has exactly the same exposure and ignores it, and the worst case is one confusing message followed by a reload. Build a guard only if it is reported.

**Trap 3 — "Start again" clears both.** One key in browser storage. Clearing it in either place strands the conversation on the server; staff then see two threads for one person. *Handling:* say so in the confirmation text. Keep the existing `isChannelSession()` guard.

**Trap 4 — language can flip back.** One language setting per conversation, and the chat sends the browser's default at `start`. *Handling:* already covered — §1.3 makes every turn carry `locale`, so the form's last word wins.

**2.7 Reuse, do not refactor**

Reuse `usePublicConversation`, `adoptPublicSession`, `clearPublicSession`, `isChannelSession`, the upload hook and the api-client as they are.

⚠️ **Do not move `startOver` into a shared hook.** `chat.test.tsx` reads `chat.tsx` as text and asserts `clearPublicSession()` appears exactly once, behind `isChannelSession()`. Give the form its own copy with the same guard and the same test.

**Done when:** a flight-delay claim can be completed end to end on desktop and in a phone browser against the dev stack.

---

### Phase 3 — finish · 3–4 days

- Review page with Change, Submitted page, Handover page.
- Accessibility: labelled fields, errors linked with `aria-describedby`, focus jumps to the first error, 44 px touch targets, review page as a `<dl>`.
- EN/BM switch wired to `locale`. Form-only wording lives in one `form-copy.ts` keyed by language, ready for the Malay work.
- Require Supabase storage in production; the local-disk fallback must not run there.
- Add a `surface` dimension to the per-turn log line.
- A written manual test script for the golden path — flight delay, three documents, one correction at review, submit — walked on desktop and on a phone before each release.
- Update `CLAUDE.md` and add the progress entry to `MASTER_PLAN.md` §8.

**Done when:** the manual script passes on both widths and the form is reachable on the staging claimant host.

**Deliberately not here** (each affects the chat equally, so none is form work — raise them as platform items): a Content-Security-Policy at the edge, expiring idle sessions, and an end-to-end test framework. The repo has no e2e harness at all; standing one up is its own project, not a line in this plan.

---

### Later (not scheduled)

Per-insurer branding and web addresses (needs D2 reopened) · a claim-status page the claimant can visit · a downloadable copy of the submitted claim · Malay wording for the five flows · a video-call booking from the form.

---

## 5. Reference — the bits the form talks to

**Endpoints** (all public, all take the `X-Web-Session` header):

| | |
|---|---|
| `POST /api/v1/public/conversation/start?locale=` | opens the conversation, returns the session token |
| `GET /api/v1/public/conversation` | full transcript |
| `GET /api/v1/public/conversation/state` | **new** — §4 Phase 1.1 |
| `POST /api/v1/public/conversation/turn` | one answer |
| `POST /api/v1/public/conversation/upload` | one file: fields `file`, `type`, `stepId` |

**One turn:** `{ clientMessageId, text? , callbackValue?, callbackStepId?, storedDocumentId?, locale?, surface? }`. Unknown fields are rejected.

**Values the form sends:**

| Meaning | Value |
|---|---|
| Agree to consent | `__consent:agree` |
| Decline consent | `__consent:decline` |
| Change an earlier answer | `__edit:<stepId>` |
| Confirm and submit | `'true'` on the review step |
| Skip an optional document | text `'skip'` |
| Add a document later | text `'later'` |

**Limits:** 50 MB per file · 20 turns per minute per conversation · `start` 2/sec and 10/min · `turn` 3/sec and 40/10 sec · `upload` 2/sec and 20/min.

---

## 6. Tests

**case-service**
- `state` returns the right `stage` for every binding state; the flow and case payloads match what the authenticated endpoints return; masked answers stay masked; the document id never appears; 403 without a session.
- `synthesiseStep('__edit-menu')` returns the menu.
- Upload allowlist rejects an HTML file named `.pdf`.

**claimant-web — the section map**
- Every step of all five flows lands in exactly one section; review is last; the medical notice lands in evidence.
- An unknown step id falls back to *What happened* rather than disappearing.
- `sectionsFor` reports completion and the first incomplete section correctly.

**claimant-web** (Vitest; mock only `@/lib/api-client`, let hooks and cache run for real)
- Each page renders from a fixture `state`.
- The submit engine: sends turns in path order · sends `__edit` first when the step differs · stops on a non-advancing turn and shows the message under the right field · uploads before sending the document turn.
- Retries on the rate-limit reply instead of blaming a field; "Start again" copy names both surfaces.
- Handover hides the sections.
- The `startOver` source-scan test.

**End-to-end** — none exists in the repo, and this plan does not add a framework. The golden path is covered by the written manual script in Phase 3.

---

## 7. Launch gates — safe to skip for the pilot, blocking before the site is public

The pilot is an unadvertised address given to known testers. These close before the site is linked from an insurer's page, printed on a document, or left open to search engines.

| Gate | Why it can wait | What it takes |
|---|---|---|
| **Captcha on "Send code"** | Nothing to abuse while nobody has the address. Anyone can otherwise make the system send a WhatsApp code to any number, at our cost — the existing limit is per number, so rotating numbers bypasses it. | Cloudflare Turnstile: verify server-side in the gateway, widget on the entry page. Half a day. Adds Cloudflare to the cross-border transfer register. |
| **SMS as an alternative to WhatsApp** | Pilot testers have WhatsApp. | The code is a day; **finding a Malaysian SMS provider is not**. Start that early — it is the long pole. |
| **Search-engine decision** | An unlinked address is not indexed in practice. | One line, but decide deliberately: should a claimant be able to find this by searching, or is it reached only from an insurer's site? |

---

## 8. Deployment

- `/form` needs **no Caddy change** on the existing claimant host, and no CORS change — the API is same-origin there.
- No new environment variables for the pilot. Confirm `HANDLING_FIRM_TENANT_ID`, the `SUPABASE_*` settings and the three `WHATSAPP_*` settings are present.
- A vanity address (`claims.<insurer>.com.my`) is one more Caddy site block reusing the same files — later, with D2.

---

## 9. Timeline

| Phase | Days |
|---|---|
| 0 — blockers | 2–3 |
| 1 — backend | 3–4 |
| 2 — the form | 6–8 |
| 3 — finish | 3–4 |

**Under three weeks** for one engineer, excluding the launch gates.

Two things sit on the critical path: **B1**, because nothing can go live while consent notices need a manual database edit; and, if a public launch follows soon after the pilot, **starting the SMS provider search now**.

---

## 10. Explicitly out of scope

- No accounts, passwords or email logins. Mobile number and a code, like every other channel.
- No batch-answer API. If some future flow has forty fields in a section, revisit then — do not add a second way to write answers.
- No claim-status page for claimants yet, no video-call booking, no motor claims.
- Nothing on the site may claim data stays in Malaysia (`MASTER_PLAN.md` §3.4).
