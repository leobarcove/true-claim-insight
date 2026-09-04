# Web-form microsite — implementation plan

**Status:** decisions settled 28 August and 2 September 2026. Not started.
**What we are building:** a claim form on claimant-web — a fourth way to lodge a claim, alongside the web chat, WhatsApp and Telegram. One build, served at two addresses: `/form` for the claimant, and a staff-only host where an **agent fills in the same form** on the claimant's behalf after obtaining their verbal agreement (§1.4). Desktop first, works in a phone browser. No app.
**Design:** 26 approved artboards — the claimant journey (start · code · consent · six form sections · submitted) in a desktop and a phone-browser version, plus the six agent screens (sign in · code · who is this for · verbal consent · a section · submitted). One `gen.mjs` builds them all; source committed in `docs/assets/web-form/`.

---

## 1. How it works — read this before anything else

**The form is its own channel, driven by the existing conversation engine. It is not a second intake implementation.**

Everything about a claim already lives in one engine: the server holds the questions, decides what comes next, and stores the answers. The chat asks one question at a time. The form shows six or so at once — but underneath, it sends them to the server **one at a time**, in the order the server expects.

"Its own channel" is about the *thread*, not the machinery. The form gets its own `WEB_FORM` binding, separate from the web chat's, so the two never meet — but every answer still travels the same endpoint, the same flow definitions and the same gateway that Telegram and WhatsApp use. Sharing the engine is what makes the form nearly free to build; sharing a thread is what D1 rejected.

**Do not assume the Telegram Mini App is a precedent for this.** It isn't — `telegram.tsx` renders `PublicChatPage`, so the Mini App *is* the chat in a webview, one question at a time. Nothing in the codebase shows many fields at once. The part of this project with no precedent is the submit engine (§2.5); everything else follows an existing path closely.

Two hard rules follow:

1. **No second answer-processing implementation.** Every self-service answer goes through `POST /api/v1/public/conversation/turn`, the same as chat. The authenticated agent-assisted endpoint delegates to that same application service. This path is where redaction, policy matching, deadline tracking, audit rows and access checks live; a shortcut around it loses all of them.
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
| **D1** | Its own channel, or share with the web chat? | **Its own channel** — decided 2 September 2026, reversing the earlier "share". `/form` is a new `WEB_FORM` channel with its own conversation. Someone who starts on the form and then opens the chat starts again: **new conversation, new claim request, nothing carried over.** |
| **D2** | How do we know which insurer? | **From the policy number**, as today. Per-insurer branding and web addresses come later. |
| **D3** | How does the code reach the claimant? | **WhatsApp.** There is no SMS anywhere in the system. Fine for the pilot; SMS is a launch gate (§7). |
| **D4** | Captcha on "Send code"? | **Not for the pilot.** It is a launch gate (§7). |
| **D5** | Malay? | **Ship English.** The language switch works, but no Malay wording exists for the questions yet. Translating them is a separate job. |
| **D6** | How can an agent complete the form when the claimant cannot provide an OTP? | **The agent uses the same form, from a staff-only address, signed in with their own mobile and a WhatsApp code.** No claimant OTP, no public session. Before entering any of the claimant's details the agent must attest that they explained the process and the privacy notice and that the claimant verbally agreed. The platform records the attestation; responsibility for obtaining valid verbal agreement stays with the agent's organisation. Details in §1.4. |

Three of these need a note, because they are easy to get wrong later:

- **D1** — the earlier decision was to share, on the reasoning that splitting would leave anyone who switched surfaces with two claims to merge by hand. **That cost is now accepted rather than avoided.** The form and the chat are different products; someone who abandons one and opens the other has usually changed their mind about *how* they want to claim, and a half-finished form reappearing inside a chat thread is more confusing than a clean start. But the cost is real and must be designed for rather than discovered — see the resume-behaviour note at the end of §3, and say plainly on both surfaces that switching means starting again.
- **D3** — a claimant without WhatsApp cannot use the site at all. Say "WhatsApp" in the copy, never "we text you".
- **D6** — OTP and consent are different controls. OTP establishes control of a phone for self-service; it is not required when a signed-in staff member acts through the agent path, because the agent has proved *their own* number instead. Do not pretend that the claimant clicked or digitally accepted anything. Record the event accurately as **agent-attested verbal consent**, including the staff user, organisation, time, channel and approved notice version.

### Agent-assisted operating rule

The platform does not decide whether the conversation between the agent and claimant
occurred, or whether the claimant genuinely agreed. The insurer or adjusting firm owns that
responsibility. The platform's job is to require a truthful staff attestation and keep a
complete trail.

Before the first personal-data answer is saved, the agent must confirm this declaration on
the form:

> I confirm that I explained the assisted-claim process and the applicable privacy notice to the claimant, and the claimant verbally agreed to me entering and submitting this claim request on their behalf.

It is stored as a consent record, not a note — who attested, which firm, when, how they
spoke to the claimant, and which approved notice version was read out; §1.4 says exactly
where. Every answer and document entered this way stays attributable to that staff user.
The record, and every screen that shows it, must say **"Agent attested that verbal consent
was obtained"** — never **"Claimant accepted digitally"**.

No universal OTP, bypass flag, shared claimant session token, agent-entered claimant OTP or permanent link is permitted.

---

## 3. Must be fixed before anything goes live

Not form work, but a public form makes each of these visible to claimants.

| | Problem | Fix | Where |
|---|---|---|---|
| **B1** | On a fresh database, consent notices are unapproved, so **all intake is blocked** — chat included. The approval endpoint exists but is unreachable: not proxied, no screen. | Proxy `POST /api/v1/consent/notice/:purpose/:version/approve` through the gateway; add a one-screen approval page for `COMPLIANCE_OFFICER` / `FIRM_ADMIN`. | api-gateway; adjuster-portal. See `docs/PDPA_NOTICE_APPROVAL_GAP.md`. |
| **B2** | Uploads accept **any** file type. The only check today is the browser's `accept` attribute, which anyone can bypass. | Allowlist `image/jpeg, image/png, image/webp, image/heic, application/pdf` plus a magic-byte check before storing. | `apps/case-service/src/cases/cases.service.ts` (`uploadDocument`) |
| **B3** | Without `HANDLING_FIRM_TENANT_ID`, creating a claim fails with "No handling organisation is configured". | Set it per environment. | env |
| **B4** | With no WhatsApp OTP settings, production **silently never delivers a code** — on every channel. | Fail at boot instead: require the three `WHATSAPP_*` settings when `NODE_ENV=production`. | `apps/api-gateway/src/auth/` |
| ~~**B5**~~ | ~~A claimant who stops halfway and comes back on a different channel gets a brand-new claim.~~ **Withdrawn 2 September 2026.** An unfinished intake is not a claim request — nothing has been submitted, and the working queue tabs (`SUBMITTED`, `UNDER_REVIEW`, `INFO_REQUESTED`, `REFERRED_TO_EXPERT`, `CONVERTED`, `REJECTED`) do not show `DRAFT` or `IN_PROGRESS`, so an abandoned half is not a duplicate anybody works. | **Do nothing.** Specifically: do **not** widen the resume filter to include `DRAFT`/`IN_PROGRESS`, and do not rename `resumeReturnedCase`. Every channel starts clean. | — |

**Resume behaviour, decided 2 September 2026: fresh start on every channel.**

Change of channel never resurrects an unfinished intake. Someone who abandons the form and
opens the chat — or abandons WhatsApp and opens Telegram — begins again. The reasoning is
simply that a half-filled intake is not a claim request: nothing was submitted, so there is
nothing to be offered back and nothing sitting in a queue.

**One thing this does not touch, and must not.** `resumeReturnedCase` also handles cases in
`INFO_REQUESTED` — a *submitted* claim request that staff have sent back asking for one more
thing. That is a real request, the claimant is expected to return to it, and it stays
exactly as it works today. The withdrawn B5 was only ever about widening that same machinery
to cover drafts. Leave the machinery alone; the widening simply does not happen.

So the rule is: **`INFO_REQUESTED` resumes, drafts never do.**

Two consequences to accept knowingly:

- An abandoned `DRAFT`/`IN_PROGRESS` row stays in the database, reachable through the "all"
  view but on no working tab. That is untidy, not harmful. If the volume ever becomes
  annoying, sweep them on age — it is a retention job, not intake work.
- Somebody who genuinely wants to switch surfaces mid-claim retypes what they had entered.
  Say so on both surfaces before they start, so it is an expectation rather than a surprise.

---

## 4. Build order

### Phase 0 — clear the blockers · 2–3 days

Do B1–B4 above. B5 is withdrawn — see §3.

**Done when:** a fresh database can pass the consent gate through the portal (not a manual database edit), a missing OTP transport stops the service at boot rather than at a claimant, and an upload of the wrong file type is refused by the server rather than only by the browser.

---

### Phase 1 — backend · 4–5 days

**1.1 New endpoint: `GET /api/v1/public/conversation/state`**

Logged-in claimants already get everything the form needs, from two endpoints that exist today:

- `GET /cases/:id` — case detail with documents, checklist and flow state
- `GET /cases/:id/flow` — the full pinned flow, described in its own docs as *"fetched once per case by the claimant app to rebuild the transcript and render each step"*

A public visitor has no case id and no login, so they cannot call either. **Mirror them for the public session**, returning the same two payloads the authenticated app already receives:

```ts
{
  stage: 'phone' | 'code' | 'consent' | 'claim-type' | 'flow' | 'submitted';
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
- `stage` is derived from the conversation: `pendingPhone` set → `code`; no claimant → `phone`; no case yet → whichever pre-claim question was last asked; case submitted → `submitted`. There is no handover stage: a `WEB_FORM` binding can never enter handover (§2.7).
- Documents: expose **filename and time only**, never the document id or a URL. Add a test asserting the id is absent.
- Same session header and throttle class as the existing `GET /api/v1/public/conversation`.

**1.2 Give the form its own channel**

D1 was reversed on 2 September 2026. This is a schema change and it comes first, because everything else keys off it.

- Add `WEB_FORM` to the `CaseChannel` enum: Prisma schema plus migration, and the mirror in `packages/shared-types/src/index.ts`.
- Add the matching entries to `CHANNEL_LABELS` and `CHANNEL_CAPABILITIES` in `packages/shared-types/src/channel-capabilities.ts`. Copy `WEB_CHAT`'s values with one deliberate difference: **`summaryPanel: true`**. The form draws the rail in §2.3, so unlike the chat it can honestly claim one — that flag is `false` on `WEB_CHAT` precisely because the panel was declared and never built.
- Add `WEB_FORM` to the `inCountry` list at `conversation.gateway.ts:379`. The form is served from our own host with no offshore processor in the path, exactly like `WEB_CHAT`.
- The binding opens as `(WEB_FORM, sessionId)`, so a visitor on `/form` and the same visitor on `/chat` hold two bindings that never meet. That separation **is** D1; nothing else enforces it.

The `surface` tag from the earlier draft is gone — the channel now says what it was for. The
one thing it would still distinguish is a Telegram Mini App turn from a Telegram chat turn,
a pre-existing gap listed under *Later*.

**1.3 Three small fixes**

| Fix | Where | Why |
|---|---|---|
| Send `locale` on every turn, not only at `start` | `apps/claimant-web/src/hooks/use-public-conversation.ts` (`useSendPublicTurn`) | Otherwise the language switch does nothing after the first message. |
| Record consent as `ConsentChannel.WEB_FORM` when the binding's channel is `CaseChannel.WEB_FORM` | `conversation.gateway.ts` (~line 2086) | Today every channel records `MESSAGING`. The right enum value already exists — and now that the form is its own channel, the branch reads off the binding rather than a client-supplied tag, which is the safer of the two. |
| Teach `synthesiseStep` about `__edit-menu` | `conversation.gateway.ts` (~line 2201) | Closes `docs/INTAKE_CHANGE_SOMETHING_GAP.md` for the chat. The form does not need the menu, but the chat must not strand people. |

**Done when:** `GET …/state` returns correctly at every stage, and the existing chat test suite still passes.

**1.4 Agent-assisted intake — the same form, a different door**

Settled 2 September 2026, and it replaces the earlier sketch of a separate portal flow.
**The agent fills in the very form the claimant would have used**, not a staff page that
mirrors it. Only two screens differ; everything from *Claim type* through *Review* is the
identical component tree, so a question added to a flow appears on both paths at once and
neither can drift from the other.

Designs: six artboards on the canvas, the bottom row, labelled `Agent ·` —
`AgentSignIn`, `AgentCode`, `AgentLookup`, `AgentDeclaration`, `AgentSection`,
`AgentSubmitted`. Sources in the same `gen.mjs` as the claimant screens.

**The rule everything else hangs off: the door decides, never the page.** Whether the OTP
is required is settled by *how the browser arrived* — the host it is on and the session it
carries — and is resolved server-side before the first screen renders. No field, flag,
query parameter or header sent by the client may influence it. A form that can declare
itself assisted is a form in which anyone can start a claim against any number they can
type, and the code sent to the claimant's own phone is the only control standing in the
way of exactly that.

- The assisted path uses the same server-owned question order and the same
  answer-processing service as public conversation turns. Do not send agent answers through
  `X-Web-Session` and do not create a public claimant session for the agent.
- **Roles, confirmed 2 September 2026: `ADJUSTER`, `FIRM_ADMIN`, `SUPER_ADMIN`. `SUPPORT_DESK`
  is deliberately excluded.** This is exactly what `ROLE_PERMISSIONS` already grants for
  `CLAIMS_CREATE`, so **no permission change is needed** — the assisted form inherits the
  right list by doing nothing. Note that `FIRM_ADMIN` exists in insurer tenants as well as
  adjusting-firm ones, so insurer staff can already create; the routing decision below is
  what makes that safe. Enforce tenant access on every request regardless.
- Require the structured verbal-consent attestation before accepting the first personal-data answer. Reject an assisted turn if the attestation is absent, belongs to another tenant or references an unapproved notice version.
- Persist `enteredByUserId` (or equivalent audit metadata) for every assisted answer and uploaded document. Preserve that provenance if an answer is later changed.
- The agent-assisted path is already distinguishable without a tag: the case carries `channel: STAFF`, `initiatedBy: STAFF` and `createdByUserId`. Show that as an **Agent-assisted** badge in the staff thread and the vetting queue. A `surface` value is not needed for it.
- Submission creates the same submitted **claim request** as self-service. Store `submissionMethod: 'AGENT_ASSISTED'` and `consentMethod: 'VERBAL_AGENT_ATTESTED'`; do not synthesize a claimant digital-acceptance event.

**Selling agents are out of scope for the pilot — decided 2 September 2026.**

"Agent" in this plan means **staff**: an employee of the adjusting firm or of the insurer,
with a login. It does **not** mean the tied agent or broker who sold the policy, even though
that person is the one most likely to be sitting beside a claimant.

Two reasons, and the second is the blocking one:

1. **No login, no assisted path.** The whole design substitutes staff authentication for the
   claimant's OTP. Remove the login and there is no identity to attribute an answer to, no
   one to hold the consent attestation, and nothing to audit. An unauthenticated assisted
   path is not a smaller version of this feature; it is the feature with its safeguards
   removed.
2. **There is no access scope that fits them.** A selling agent must see their own customers
   and nobody else's. The platform has no such scope: `tenantFilter` narrows to
   `claimantId` for a claimant, returns `{}` for `SUPER_ADMIN`, and otherwise returns
   `{ tenantId }` — the whole company. `CLAIMS_VIEW_OWN` on the adjuster role is a
   front-end label with no server-side counterpart. So giving a selling agent an existing
   role (`FIRM_ADMIN` being the obvious temptation) would hand them every claim at that
   insurer, unmasked personal data included, plus user management and claim approval.

**What they do instead, and it needs no new code.** The agent sits with the claimant and
helps them complete the ordinary public form **on the claimant's own phone**. The code goes
to the claimant's WhatsApp, the claimant taps Agree on the notice themselves. That is
better evidence than any attestation, because the claimant really did consent — and it is
already built.

Logins for selling agents are their own project: a new user kind, a per-agent access scope
the platform has never needed, and a fresh PDPA question about a third party attesting
consent on an insurer's behalf. Do not approach it as a permissions tweak.

**Routing: an assisted claim goes where the customer's own claim would go.** Decided
2 September 2026.

`resolveCaseTenant` has two arms today, and they disagree. A **claimant** is routed to an
adjusting firm — the insurer named on the matched policy nominates one in its tenant
settings, otherwise `HANDLING_FIRM_TENANT_ID`, and `isAdjustingFirm` refuses anything that
is not one. **Any other caller** short-circuits on the first line and gets
`tenantContext.tenantId`: their own organisation, no routing at all. So the identical claim
for the identical customer lands in a different queue depending on who typed it — and an
insurer's agent filling one in would drop it into the insurer's own queue, where the
adjusters who do the work cannot see it.

**The assisted path must take the claimant arm.** Whoever fills the form in — the customer,
the firm's own agent, or the insurer's agent — the case is routed by policy and lands in the
handling adjusting firm's queue. Who typed it stays recorded on the case (`channel: STAFF`,
`initiatedBy: STAFF`, `createdByUserId`); it simply stops deciding where the work goes.

Three implementation notes:

- **Do not change `resolveCaseTenant`'s existing arms.** Route on the *intent* of the call,
  not on the caller's role — an assisted intake asks for claimant routing explicitly. FNOL
  email ingestion is the same shape and is arguably mis-routed for the same reason, but it
  is out of scope here: raise it separately rather than widening this change.
- **The creating agent may lose sight of the case, and that is correct.** Tenant isolation
  is strict, so an insurer's agent who creates a case owned by the adjusting firm cannot
  then open it. The portal currently navigates to `/cases/:id` straight after creation,
  which would 403. Send them to a confirmation screen showing the case number and the
  handling firm instead — the honest outcome is "handed over", not "here is your case".
- **`HANDLING_FIRM_TENANT_ID` becomes load-bearing for staff intake too**, not just
  self-service. B3 already requires it per environment; this widens the blast radius of
  getting it wrong, so the boot check should be explicit rather than surfacing as a failed
  claim creation.

**Where each version lives.** One React build, two addresses. The app reads the host it
was served from and renders the matching first screen.

| | Claimant | Agent |
|---|---|---|
| Local dev | `http://localhost:4301/form` | `http://localhost:4301/agent` |
| Local via the tunnel | `https://tci-app.smitherytech.com/form` | `https://tci-app.smitherytech.com/agent` |
| Staging | `$CLAIMANT_HOST/form` | `$AGENT_HOST/form` |
| Production | `https://claims.<brand>/form` | `https://agent.<brand>/form` |

A path locally, because a second hostname is not worth standing up for `pnpm dev`. From
staging onwards a **separate hostname on the same build** — one DNS record and one more
block in `deploy/staging/Caddyfile`, copied from `{$CLAIMANT_HOST}`; no second deployment,
no second front end. The separate host is what lets the agent side be locked down further
later (office IP, VPN) without touching the public form, and it is also how per-insurer
branding stays tidy when D2 reopens: `agent.<insurer>` beside `claims.<insurer>`, same
build, more blocks.

**How the agent signs in: their own mobile and a WhatsApp code.** No password anywhere on
this site.

- The agent enters **their own** number — the screen says so explicitly, because the very
  next screen asks for the claimant's. Their firm registers which staff numbers may sign
  in, so access is granted and revoked in one list rather than by managing accounts.
- Reuses the WhatsApp OTP transport that already exists for claimants. Nothing new on the
  sending side. B4 already makes a missing transport fail at boot, which now protects staff
  sign-in too.
- **Session lasts 30 days on the device** ("Keep me signed in"), which is what makes this
  liveable: an agent meets these two screens about as often as they change phone, not once
  per claim. A short session would have turned assisted intake into an OTP treadmill and is
  the reason a password screen was rejected in the first place.
- Rejected alternatives, recorded so they are not revisited by accident: an emailed
  password (a secret to leak, reset and share between colleagues, and the only password in
  the whole claimant-facing product); a **permanent link** (a credential that cannot be
  rotated or revoked, leaks through address bars, browser history and forwarding, and grants
  OTP-free claim creation against any number to whoever holds it); and an **agent code**
  used as the credential (an identifier printed on policy documents and quotes — a name
  badge, not a key). An agent code is still worth recording *on* the claim, and worth
  checking against the insurer's active list *after* sign-in — as data and as a
  cross-check, never as the door.

**The two screens that differ, and only these two.**

| Step | Claimant | Agent |
|---|---|---|
| 1 | Mobile number → WhatsApp code to *their* phone | Sign in (agent's own mobile → code) |
| 2 | Read the notice, tap **I agree** | **Who is this for** — look the claimant up; existing records are matched and shown, new ones are typed in but **not created here**. No code is sent. |
| 3 | — | **Verbal consent declaration** — the notice, the attestation tick, how they spoke (phone / in person / video / other), an optional call reference |
| 4–9 | Claim type → You & your trip → What happened → Evidence → Payout → Review | **Identical** |
| End | Submitted | Submitted, plus who it was handed to and who entered it |

**The band.** Every assisted screen carries an amber strip under the header; no claimant
screen ever does. It names the claimant being entered for, their number, the consent state
(`Consent not yet recorded — no claim details can be entered` until the declaration is
made, then `Verbal consent attested by you at 10:42 · notice v3 (EN)`), and the signed-in
agent with a sign-out link. Amber rather than the site green deliberately: it is a standing
reminder that the person typing is not the person the data is about.

At phone width the strip is redrawn rather than wrapped. The desktop row becomes four lines
at 390px and the line that wraps off the bottom is the consent state — the one thing an
agent must not lose track of, pushed under the fold by the agent's own name. So: the
claimant on top, consent on a tinted row of its own, and the agent's identity reduced to a
44px initials button that opens an account panel. The button **opens a panel; it does not
sign out on the tap.** A circle that ends the session and discards a half-entered claim,
sitting beside the name an agent reads constantly, is a trap — the destructive action lives
behind a button that says what it is and what it costs.

**Nothing is written before consent, and nothing is read either.** The first
screen makes no request at all: the agent types the number, the IC and the name
the claimant gives them and continues. A search that must be run, waited for and
read before Continue goes live is a step between an agent on a call and the
claim, for an answer that changes nothing they then do — so whether we already
hold this person is settled server-side at the declaration, where `resolve`
matches on the IC first and the number second and creates a record only if there
is none. `POST /claimants/lookup` remains, read-only and unused by the form.

The cost, recorded because it is real: the agent no longer sees *"we hold this
person, on a different number"*. `findOrCreate` fills only blank fields, so an
existing claimant's name and IC are never overwritten — but a claim matched by
IC still attaches to the record's own number rather than the one the agent is
speaking to, and now says so to nobody. If that bites, the place to surface it
is the declaration screen, after the resolve, not a search before it. The claimant record, the consent row and the
Case are all created together on **Record consent and continue**, in that order — the order
is what makes a partial failure safe, since a claimant with no consent is a row a retry
finds and reuses, where a Case with no consent would be a claim nobody agreed to.

This was wrong until 3 September 2026: **Find claimant** called the find-*or-create*
endpoint, so a mistyped digit left a permanent claimant row carrying a name and an IC, with
nothing in the flow to remove it once the agent noticed and retyped. The litter was the
lesser half. That row is personal data, written before consent, on a screen that told the
agent nothing was saved and one screen before another that says no details may be entered
until consent is recorded. `POST /claimants/resolve` still exists and is still
find-or-create; it is now called once, from the declaration screen.

**What identifies a claimant is the IC, not the phone.** Both `lookup` and `resolve` match
on the NRIC blind index first and fall back to the phone number — an IC identifies a
person, a phone number identifies a handset. The consequence has to be visible: a claimant
can be found on a number we do not hold for them, and the Case then carries the number on
their record rather than the one the agent is speaking to. The lookup response therefore
returns `matchedOn`, and the screen says *"Found by IC — we hold +60… for them, not the
number above."* A half-typed IC is refused before the lookup runs, because it hashes to
nothing, misses a claimant we already hold, and would open a second record for them at the
declaration screen.

**What is actually new on the server — three things, not eight routes.**

The authenticated twin of the public conversation routes **already exists**: the per-case
endpoints the logged-in claimant app uses. Their `INTAKE_ROLES` list is exactly `CLAIMANT`,
`ADJUSTER`, `FIRM_ADMIN`, `SUPER_ADMIN` — the roles decided above — so nothing about who
may call them has to change.

| The form needs to | Claimant — public, `X-Web-Session` | Agent — signed in; **exists today** |
|---|---|---|
| open the intake | `POST /public/conversation/start`, then turns | `POST /cases` (claimant resolved by phone, `travelClaimType`) |
| record consent | the `__consent:agree` turn | `POST /consent/claimant/:id/grant`, carrying the attestation |
| read the whole picture | `GET /public/conversation/state` — new, §1.1 | `GET /cases/:id` + `GET /cases/:id/flow` |
| save one answer | `POST /public/conversation/turn` | `PATCH /cases/:id/answers` |
| attach a document | `POST /public/conversation/upload` | `POST /cases/:id/documents/upload` |
| submit | `'true'` on the review step | `POST /cases/:id/submit` |

The form's components read the same case + flow shape either way, so the six sections are
one implementation with two thin transports behind them.

So the agent path adds **three** things and nothing else:

1. **Staff sign-in by mobile.** `POST /auth/staff/send-code` and `POST /auth/staff/verify-code`
   in api-gateway: look up an active `User` by `phoneNumber`, send through the existing
   WhatsApp OTP transport, and issue the normal staff JWT with a 30-day refresh. Today staff
   log in by email and password only, and the mobile-code login exists only for claimants
   (`auth/claimant/send-otp`). `User.phoneNumber` is **not** unique — make it unique among
   active users in the same migration, or the lookup is ambiguous.
2. **The creator may keep editing a draft.** The case is routed to the handling firm at
   creation (Routing, above), so strict tenant isolation would lock an insurer's agent out of
   the very claim they are filling in — at the second section, not after submit. Add one
   rule to `CasesService.assertAccess`: a case in `DRAFT` or `IN_PROGRESS` whose
   `createdByUserId` is the caller is accessible to that caller. It lapses at submit, which
   is the decided behaviour, and it is what the confirmation screen explains.
3. **Routing intent on `POST /cases`** — the explicit "route as a claimant would be routed"
   flag described under Routing.

No `/agent/intakes/*` family. The shapes must not multiply.

**How the attestation is stored — use what is already there.**

Confirmed 2 September 2026: the assisted path always takes verbal consent. There is no
claimant-tap alternative, so nothing in this path ever waits on the claimant being
reachable.

- **Reuse the identity resolution that already works.** The portal's existing staff
  capture form resolves a claimant from a phone number with no OTP
  (`apps/api-gateway/src/cases/cases.controller.ts:74`, `findOrCreate`) and creates the
  case as `channel: STAFF` / `initiatedBy: STAFF` / `createdByUserId`. The **Who is this
  for** screen does the same resolution, but splits the read from the write: it *looks up*,
  and the create happens at the declaration (above). Note that the existing page captures **no consent**, and
  `CasesService.create` refuses to open a Case without it — which is why staff capture
  fails today for any claimant who has not consented on another channel. The declaration
  screen closes that for the agent form; the portal page needs its own, simpler fix (below).
- **Save it on the existing `Consent` row.** No new table and no migration: `capturedVia`,
  `capturedByUserId` and `noticeId` (the exact wording and version) are already columns,
  and `interactionChannel` / `interactionReference` go in `metadata`. `grantedAt` is the
  attestation time.
- **Add `VERBAL_AGENT_ATTESTED` to `ConsentChannel`.** `STAFF_CAPTURED` cannot carry this
  alone — it reads equally as "staff typed it while the claimant watched the screen" and
  "staff say they read it out on a call", and only the second rests entirely on an agent's
  word. Those need to be distinguishable in the record, not inferred from context.
- **Wording on the claim summary and audit screens:** *"Agent attested that verbal consent
  was obtained"*. Never *"Claimant accepted"*, and never a tick that looks like a claimant
  action.

Two consequences to design for, both correct but easy to be surprised by:

1. **The record proves the declaration, not the conversation.** The platform can show which
   agent declared it, when, and against which notice version; it cannot show the call
   happened. That is the accepted position (§2, operating rule) — it is why the declaration
   wording and the audit view are load-bearing and must not be softened later.
2. **The claimant will never be shown the notice again.** `requireConsentThenStart` starts
   the case straight away when consent is already on file, so someone whose agent attested
   for them sees no privacy notice if they later message on WhatsApp or open the form. The
   agent's call is the only time that notice is ever read to that person.

**What happens to the portal's existing staff capture page**
(`apps/adjuster-portal/src/pages/cases/new.tsx`). It stays, because it does a job the
assisted form does not: typing up an FNOL that arrived by email, where there is no
claimant on the phone to consent to anything and the source is `EMAIL`. It needs the same
consent fix — it cannot create a Case today without one — but it is not the assisted
journey and should not grow a verbal-consent declaration for the email case, where no
conversation happened. Treat that as a separate, smaller fix.

**One thing the assisted form gives up, knowingly.** Answers entered by an agent travel
the conversation engine, so they do produce transcript rows — but a colleague reading that
thread is reading *the agent typing*, not the claimant speaking. The `channel: STAFF` badge
and the amber-band provenance are what stop that being misread. Never render an assisted
thread in a way that suggests the claimant wrote those words; in a dispute that is the
record that would be quoted.

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

**The notice version is recorded, not printed.** Neither the claimant's consent screen nor
the agent's notice extract shows `Version n · EN` beside the heading. The version is what
makes the consent provable and it is on the record, in the band and on the receipt — but a
version stamp beside the wording being read aloud is a document-control detail shown to
someone who is not doing document control.

This lives in claimant-web, not shared-types — only the form uses it. It is a plain map rather than a rule engine because there is no flow editor UI, so no one can currently produce a flow with renamed steps. Revisit if that changes; the fallback holds the line until then.

Alongside it, `sectionsFor(flow, answers)` returns the six sections with their steps, whether each is complete, and the first incomplete one — driving the progress bar, the section list, and where someone lands when they return.

**2.2 Field controls** — one control per `answerType`

text · date (native picker, shown dd/mm/yyyy) · datetime · number (RM prefix, numeric keypad) · choice (radio cards up to 6, searchable list above that; `allowOther` accepts typed text) · phone · document (drop zone on desktop, camera on phone) · confirm (card with one action).

Two rules across all of them:

- **`FlowStep.placeholder` is an example, never a second label.** A box labelled "Full name"
  with "Full name" greyed inside it says nothing and vanishes on the first keystroke. What
  it answers is the question the label cannot: how much of a name (does `binti` belong in
  it?), whether a flight number carries the airline code. It lives on the step beside
  `prompt`, `label` and `hint`, so both form surfaces show the same example and neither can
  drift from what the server accepts. The chat ignores it — a bot bubble has no empty box.
  **Every field that draws a box has one**, asserted against `drawsTextBox` — the control's
  own rule, asked rather than copied, so a type that changes how it renders shows up as a
  failing test instead of a quietly bare field. What is exempt is what has nowhere to put
  one: a short closed list draws radio cards, a document draws a filename row, a confirm
  draws a card, and a date or datetime draws the browser's own `dd/mm/yyyy` mask, which
  ignores `placeholder` outright.
- **What you will need is a chat message, not a form panel.** `whatYouWillNeed`
  is branch-aware — a document reachable only down an arm the answers have not
  taken is marked *(only if it applies)*, so trip cancellation does not send the
  person whose flight was cancelled by a typhoon looking for a death
  certificate. It is sent by the conversation, where there is no other way to
  see what is coming. The forms do not draw it: a section list, a step bar and
  six named sections already show the shape of the claim, and a list of
  documents above the first question is a wall to read before the first answer.
  Tried on both surfaces on 3 September 2026 and removed the same day.
- **Overlay wording resolves per channel and per locale on every surface.**
  `flow_overlays` carries the per-channel, per-locale wording, and three callers
  reached it inconsistently: the gateway passed the real channel, `/state`
  hardcoded `WEB_CHAT` even though it serves the web *form* as well, and
  `/cases/:id/flow` passed nothing at all — so the authenticated surfaces could
  never show Malay. `/state` now passes `binding.channel` and `/cases/:id/flow`
  takes a `?locale=` (narrowed to `en`/`ms`) and dresses with the Case's own
  channel. Inert while no overlay is published, which is exactly why it was
  invisible.
- **The agent form prefills the claimant's name.** It was typed on the lookup screen one
  step earlier and is on the claimant's record; asking for it again invites two spellings of
  one person's name, which is precisely what that field's own hint about matching the IC and
  the bank account exists to prevent. Seeded into pending `values` rather than merely shown,
  or the required-field guard would report a full box as missing — and seeded only where the
  case holds no answer and the agent has typed nothing, so it prefills without ever
  overwriting.
- **The form asks what the conversation asks.** Telegram, WhatsApp and the web
  chat walk the flow a step at a time through `evaluateNext`, so they cannot ask
  a question the answers route around. The form draws a whole section at once,
  which is the only way the two can disagree — and it did, twice:
  `sectionsFor` laid out `flow.steps` whole, so a trip cancelled by a **natural
  disaster** was asked for a *medical report*, and the loop skipped every
  `confirm` step, so a **medical** claim reached the review with the required
  specialist-review notice still unanswered. Both were invisible from the form's
  side: it thought the claim finished and the server did not, or it demanded a
  document the server never wanted, so an evidence section could not be
  completed by uploading anything. `sectionsFor` now filters through `pathSteps`
  — the flow's own resolver, the one the gateway and the submit guard use — and
  `stepsToSend` acknowledges a notice with `'true'`, exactly as tapping Confirm
  does in a thread. The property is asserted over every combination of every
  branch input in every flow, so a branch added later is covered the day it is
  published. One `sectionsFor` serves both form surfaces, so both are fixed.
  (Only one branch exists today: `cancellation-reason` in `ILLNESS` or
  `DEATH_OF_RELATIVE` → medical report, else straight to the booking invoice.)
- **A pair of fields is a wide-screen affordance.** `FIELD_PAIRS` declares which fields sit
  together; `rowClassFor` gives every pair `sm:grid-cols-2`, so on a phone each field takes
  the full width whatever it holds. Two plain dates used to be excepted and stayed paired at
  390px, which put trip start and trip end in a row while scheduled and actual departure —
  a pair by the same reasoning — stacked beneath. The seam tracked the field *type*, not
  what the fields meant, and the date only just fitted at 153px a column anyway.

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

The **summary rail** lists the answers captured so far, newest section last, and closes with "Saved after each step on this device." It reads straight from the case payload — no separate state. This is the summary panel `WEB_CHAT` had to declare `false` because it was announced and never built. `WEB_FORM` sets `summaryPanel: true` from the start (§1.2) — and because the channels are now separate, saying so costs the chat nothing.

The three pre-claim pages (Start, Code, Consent) have **no section list and no rail** — no claim exists yet, so there is nothing to show and no sections to list.

**2.4 The pages**

| Page | Shown when `stage` is | What it does |
|---|---|---|
| Start | `phone` | Number field → `POST start`, then a text turn with the number. Copy says the code arrives **on WhatsApp**, and that progress is saved **on this device** — opening the form on another phone or browser starts a new claim request (§3, resume behaviour). Beside it (below it on a phone) a **"Have these ready"** card: policy number · passport or IC · boarding pass or itinerary · airline letter, police report or receipts · bank account. Static text, but it is what stops people abandoning at the Evidence step. |
| Code | `code` | Six boxes → text turn with the digits. Wrong code shows `lastReply`; after five tries the server resets to `phone`. |
| Consent | `consent` | Show `consent.body` **exactly as returned**. Agree → `callbackValue: '__consent:agree'`. Decline → `'__consent:decline'` and a closing screen. |
| 1 Claim type | `claim-type` | Cards from `claimTypes`; send the chosen value as `callbackValue`. |
| 2–5 | `flow` | Sections from `sectionsFor`. |
| 6 Review | `flow` | All answers grouped by section. **Change** sends `__edit:<stepId>`, the field opens inline, the answer is sent, then re-read `state`. **Submit** sends `callbackValue: 'true'` on the review step. |
| Submitted | `submitted` | Claim reference, anything still outstanding, and three plain lines on what happens next. **No "Track this claim" and no PDF download** — decided 28 Aug; both were on the first draft of the design and both promise something out of scope. Removed from the design too. |

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

**Trap 3 — one browser, two sessions.** The chat keeps its session under a single key in browser storage. The form must use **its own key**. Share it and the two surfaces share a session, so D1's separation exists in the database but not in the browser — the exact bug the decision was meant to prevent. With separate keys, "Start again" on either page clears only that page's conversation, which is what the copy should describe. *Handling:* a distinct storage key for the form; keep the existing `isChannelSession()` guard on both.

**Trap 4 — language can flip back.** One language setting per conversation, and the chat sends the browser's default at `start`. *Handling:* already covered — §1.3 makes every turn carry `locale`, so the form's last word wins.

**2.7 Reuse, do not refactor**

Reuse `usePublicConversation`, `adoptPublicSession`, `clearPublicSession`, `isChannelSession`, the upload hook and the api-client as they are — **except the storage key**, which the form must own (Trap 3). Check whether that key is baked into these helpers before assuming it can be passed in; if it is, parameterising it is Phase 2's first task rather than a refactor to defer.

⚠️ **Do not move `startOver` into a shared hook.** `chat.test.tsx` reads `chat.tsx` as text and asserts `clearPublicSession()` appears exactly once, behind `isChannelSession()`. Give the form its own copy with the same guard and the same test.

**The form is submit-only. Nothing ever comes back to it.** Decided 2 September 2026. If
staff need more from a claimant they contact them on WhatsApp — the number was proved at
the code step — and never through the form. Two things make that true in code rather than
only in copy:

- **A `WEB_FORM` conversation can never enter handover.** `ConversationsService.takeOver`
  has no channel check today, so an operator could take over a form thread from the portal
  and strand the claimant mid-form with nothing on screen to explain why. Refuse take-over
  when `binding.channel === WEB_FORM`, with a message that says to contact the claimant on
  WhatsApp instead. In the gateway, skip the `HUMAN_WORDS` hand-over for `WEB_FORM`
  bindings — a claimant whose entire answer to a text field is the single word "agent"
  should get a validation message, not a silent change of mode. With both in place the form
  has no handover state to render, which is why it has no handover screen.
- **Email is not collected on any channel, and will not be.** The questions are one shared
  list every channel reads, so an email step would appear on WhatsApp and Telegram too.
  Consequences, both pre-existing and not made worse by the form: `Claimant.email` stays
  null for anyone who arrives conversationally, so the two claimant notifications that pass
  `recipient: claimant?.email` (`cases.service.ts` ~834 and ~988,
  `case-reminders.processor.ts`) reach nobody. **Not form work** — a platform item: collect
  an address, or route those two notifications to WhatsApp. FNOL email ingestion is the one
  path that captures an address (`fnol-parser.ts`).

**Done when:** a flight-delay claim can be completed end to end on desktop and in a phone browser against the dev stack.

---

### Phase 3 — finish · 3–4 days

- Review page with Change, Submitted page.
- Accessibility: labelled fields, errors linked with `aria-describedby`, focus jumps to the first error, 44 px touch targets, review page as a `<dl>`.
- EN/BM switch wired to `locale`. Form-only wording lives in one `form-copy.ts` keyed by language, ready for the Malay work.
- Require Supabase storage in production; the local-disk fallback must not run there.
- Add a `channel` dimension to the per-turn log line, so "do more people finish on the form or the chat?" is answerable.
- A written manual test script for the golden path — flight delay, three documents, one correction at review, submit — walked on desktop and on a phone before each release.
- Update `CLAUDE.md` and add the progress entry to `MASTER_PLAN.md` §8.

**Agent-assisted finish:** the agent host in Caddy with its own DNS record and certificate;
the amber band on every assisted screen carrying claimant, consent state, notice version
and signed-in agent; agent provenance on the review screen; a final confirmation before
submission stating that the agent submits on the claimant's behalf on the recorded verbal
agreement; and the submitted screen naming the handling firm, because the agent will not be
able to open the case afterwards. Add the assisted screens to the manual test script —
sign-in, an expired session mid-claim, and a cross-tenant attempt.

**Done when:** the manual script passes on both widths and the form is reachable on the staging claimant host.

**Deliberately not here** (each affects the chat equally, so none is form work — raise them as platform items): a Content-Security-Policy at the edge, expiring idle sessions, and an end-to-end test framework. The repo has no e2e harness at all; standing one up is its own project, not a line in this plan.

---

### Later (not scheduled)

Per-insurer branding and web addresses (needs D2 reopened) · a claim-status page the claimant can visit · a downloadable copy of the submitted claim · Malay wording for the five flows · a video-call booking from the form · collecting a claimant email address, and with it the two dead notification paths described in §2.4 · logins for selling agents, and the per-agent access scope they would need (§1.4) · a `surface` tag on messages so Telegram Mini App turns can be told from Telegram chat turns.

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

The agent path uses the existing per-case endpoints (§1.4), signed in as staff — never `X-Web-Session` or a claimant OTP.

**One turn:** `{ clientMessageId, text? , callbackValue?, callbackStepId?, storedDocumentId?, locale? }` — plus `surface?` only if §1.2's optional Mini App tag is built. Unknown fields are rejected.

**Values the form sends:**

| Meaning | Value |
|---|---|
| Agree to consent | `__consent:agree` |
| Decline consent | `__consent:decline` |
| Change an earlier answer | `__edit:<stepId>` |
| Confirm and submit | `'true'` on the review step |
| Skip an optional document | text `'skip'` |
| Add a document later | text `'later'` |

**Limits:** 50 MB per file · **60** turns per minute per conversation · `start` 2/sec and 10/min · `turn` 3/sec and 40/10 sec · `upload` 2/sec and 20/min.

Raised from 20 on 2 September 2026, after a claimant filling the form in at
ordinary speed crossed it. Trap 1 predicted this and under-counted: a
flight-delay claim is about **thirty** turns, not twenty, because each field the
server's cursor is not already on costs two — a move and an answer. The edge
throttle (3/sec) is the burst control and is untouched; this one stops a
sustained flood, where threefold changes nothing about whether it is stopped.

---

## 6. Tests

**case-service**
- `state` returns the right `stage` for every binding state; the flow and case payloads match what the authenticated endpoints return; masked answers stay masked; the document id never appears; 403 without a session.
- `synthesiseStep('__edit-menu')` returns the menu.
- Upload allowlist rejects an HTML file named `.pdf`.
- Assisted intake rejects answers before a verbal-consent attestation exists; rejects an unapproved notice version; records the staff user on answers and documents; submits with `AGENT_ASSISTED` / `VERBAL_AGENT_ATTESTED`; and creates no claimant digital-consent event.
- Creator access: the staff user who created a draft can read and edit it while it is `DRAFT`/`IN_PROGRESS` even though it is routed to another tenant; cannot once submitted; a different user in the creator's tenant never can.
- Staff mobile sign-in: an unknown number is refused without revealing whether it exists; a known number receives a code and a staff JWT; two active users on one number is impossible after the migration.

**claimant-web — the section map**
- Every step of all five flows lands in exactly one section; review is last; the medical notice lands in evidence.
- An unknown step id falls back to *What happened* rather than disappearing.
- `sectionsFor` reports completion and the first incomplete section correctly.

**claimant-web** (Vitest; mock only `@/lib/api-client`, let hooks and cache run for real)
- Each page renders from a fixture `state`.
- The submit engine: sends turns in path order · sends `__edit` first when the step differs · stops on a non-advancing turn and shows the message under the right field · uploads before sending the document turn.
- Retries on the rate-limit reply instead of blaming a field; the form's session key is its own, so "Start again" on the form leaves a `/chat` conversation in the same browser untouched.
- A `WEB_FORM` binding never enters handover: take-over is refused, and a bare `human` answer is treated as text.
- The `startOver` source-scan test.

**claimant-web — the agent path** (same Vitest setup; `apps/adjuster-portal` still has no
test harness, and this path no longer lives there)

- The assisted form requires the attestation before any personal-data answer, sends turns in
  server path order, preserves validation errors at the correct field, and shows agent
  provenance on review.
- **Find claimant writes nothing.** Assert the endpoint, because it is the only visible
  difference: both calls succeed and both draw a card, and what separates them is a row in a
  database no rendering test can see. Cover the not-on-file card, the editing of a number
  dropping a stale answer, the half-typed IC being refused before any call, and the typed
  details being carried forward with no id.
- The initials button opens the account panel and does not sign out on the tap.
- Both forms mark every missing required field in one pass and clear each mark as soon as
  the field is corrected.
- **The door decides.** Assert against the source, the way the services do: no client-set
  value — field, query parameter or header — can put the app into assisted mode. A claimant
  session on the public host renders the claimant first screen and nothing else.
- An expired agent session mid-claim returns to sign-in and loses no entered answers.
- The amber band renders on every assisted screen and on no claimant screen.
- Submission confirmation uses "agent-attested verbal consent" wording and never states that the claimant accepted digitally.

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
- **One new host for the agent form** from staging onwards: an `AGENT_HOST` block in
  `deploy/staging/Caddyfile` copied from `{$CLAIMANT_HOST}` (same `/srv/claimant` root,
  same `app_common` import), one DNS A record, and the certificate Caddy issues itself. No
  second build and no second container.
- New environment variables: `AGENT_HOST` and its `AGENT_ORIGIN`. Otherwise confirm
  `HANDLING_FIRM_TENANT_ID`, the `SUPABASE_*` settings and the three `WHATSAPP_*` settings
  are present — `HANDLING_FIRM_TENANT_ID` now routes assisted claims too (§1.4), so a wrong
  value misfiles staff work as well as self-service.
- A vanity address (`claims.<insurer>.com.my`) is one more Caddy site block reusing the same files — later, with D2.

---

## 9. Timeline

| Phase | Days |
|---|---|
| 0 — blockers (B1–B4; B5 withdrawn) | 2 |
| 1 — backend, the `WEB_FORM` channel, staff mobile sign-in | 4–5 |
| 2 — the form (both doors share it) | 6–8 |
| 3 — finish, including the agent host | 4–5 |

**About three weeks** for one engineer, excluding the launch gates. The agent path adds
perhaps two days rather than the two weeks a separate agent product would have cost, and
that is the whole argument for sharing the form: two pre-claim screens, a band, a host, a
mobile sign-in, and one access rule — on top of endpoints that already exist.

Two things sit on the critical path: **B1**, because nothing can go live while consent notices need a manual database edit; and, if a public launch follows soon after the pilot, **starting the SMS provider search now**.

---

## 10. Explicitly out of scope

- No accounts, passwords or email logins. Mobile number and a code, like every other channel.
- No claimant account, and **no claimant OTP**, in the agent-assisted path. The agent proves
  their *own* number instead; staff authentication, tenant authorisation and the mandatory
  verbal-consent attestation govern that path. No universal OTP, bypass flag, shared
  claimant session token, agent-entered claimant OTP, or permanent link is permitted.
- No batch-answer API. If some future flow has forty fields in a section, revisit then — do not add a second way to write answers.
- No claim-status page for claimants yet, no video-call booking, no motor claims.
- Nothing on the site may claim data stays in Malaysia (`MASTER_PLAN.md` §3.4).
