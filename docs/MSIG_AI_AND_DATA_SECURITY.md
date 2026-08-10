# AI usage and data security — answers for MSIG

Prepared for the MSIG sessions, week of 10 August 2026.

**How to use this.** Everything below is either true of the running system today
or explicitly labelled as a commitment with a date. Nothing is aspirational
prose. Where the honest answer is "not yet", it says so and says what is in
place meanwhile — a vendor security assessment will find the gaps anyway, and
finding them *after* a reassuring answer is what ends a relationship.

Two positions govern this document and are settled (`MASTER_PLAN.md` §6.11,
§6.12):

- **AI is disclosed, not downplayed.** BNM PD **12.6** requires the adjusting
  report to disclose the facts, assumptions, **methods**, sources and databases
  behind an assessment. AI contribution to an assessment is a disclosable
  method. Minimising it invites exactly the scrutiny it is meant to avoid.
- **No portal scraping.** MSIG has stated that agents and adjusters may not log
  into its systems, so automated access is off the table. The sanctioned path
  is a structured policy file feed; the fallback is manual keying.

---

## 1. Where AI is used, and where it is not

| Use | Status | Human oversight |
|---|---|---|
| Document extraction from claim paperwork | Live | Every extracted value is operator-editable; nothing is accepted unreviewed |
| Voice and facial prosody signals during video assessment | Live | Consent-gated; produces **signals**, never a decision |
| Repeat-claimant and parametric fraud signals | Live | Presented with provenance; an adjuster decides |
| Document validation (name match, completeness) | **Not built** — labelled stub | n/a |
| Any automated claim decision | **Does not exist** | The insurer decides every claim |
| Medical claims | **Never auto-assessed** — enforced in code | Expert referral is a required state before a medical case can convert |

**The system recommends; MSIG decides.** No code path settles, approves or
declines a claim. That is not a policy statement — the claim lifecycle has no
transition that does it.

## 2. How AI contribution is disclosed

Disclosure is built into the report, not added on request:

- The report carries the four PD 12.6 sections — facts, assumptions,
  **methodology**, sources — and **cannot be submitted or signed while any is
  blank**. That gate is in code, not a template convention.
- `aiAssisted` is captured **per section**, not per report, so a reader sees
  which specific parts had AI involvement rather than a blanket disclaimer.
- The rendered PDF marks AI-assisted sections in the body and summarises them
  up front, alongside the author's name and licence number.
- Fraud signals keep provenance individually. The three risk scores are
  deliberately **not** merged into one number — an opaque composite is itself an
  explainability risk.

## 3. Data security

| Control | State |
|---|---|
| NRIC and bank account numbers encrypted at rest | AES-256-GCM envelope, versioned ciphertext; **plaintext columns dropped**, not shadowed |
| Lookup without decryption | HMAC blind index; `verify-nric` compares indexes in constant time and never decrypts |
| Ciphertext confined to the server | Omitted from query results **by default**; a decrypting path must opt in visibly, and a forgotten opt-in is a compile error |
| Full value access | Audited, firm-admin only |
| Audit trail | Append-only **enforced by a database trigger**, not by privileges — it binds even at a psql prompt. Records before/after values, and every refusal |
| Service-to-service auth | Internal key required before identity headers are honoured; **fails closed** when unconfigured |
| Tenant isolation | Adjusting firms and insurers are separate tenants; a record in another tenant is indistinguishable from one that does not exist |
| Segregation of duties | An assessor cannot decide their own claim unless an authority limit expressly permits it, and never above its monetary ceiling |
| Key custody | Master key behind a provider interface — moving to AWS KMS re-wraps one row and re-encrypts no data |

Every control above is asserted by an automated test that runs in CI, which is
the evidence a BNM examination under FSA s.146 would ask for.

## 4. Data residency — the honest position

**Target:** AWS Malaysia, `ap-southeast-5`. Staging already runs there.

**Today:** document extraction defaults to Google Gemini, and video analysis
uses Hume — both process data outside Malaysia. **We are not claiming in-country
processing, because it is not yet true.**

What is in place meanwhile:

- A **cross-border transfer register** records every offshore call: recipient,
  country, data description, purpose and lawful basis.
- The register is honest by design. The consent-gated biometric path records
  its basis; the extraction path records **no basis, as null**, because none is
  established — the system will not invent one. That record is what drives the
  fix.
- The **biometric path fails closed**: no consent, unknown claimant, or a
  consent service that cannot be reached all refuse analysis. Losing an analysis
  run is recoverable; processing without a basis is not.

**Commitment:** an in-country LLM path for documents containing personal data,
with per-tenant provider policy, scheduled for the week of 10 August 2026. Until
it lands, we do not run AI extraction over real claimant documents — pilot
demonstrations use synthetic data.

## 5. PDPA

- **Consent** is operative, not a checkbox. A notice version cannot be approved
  unless it exists in **both English and Bahasa Malaysia** (s.7), and consent
  cannot be recorded against unapproved wording. Withdrawal retains the original
  grant, because evidencing *when* processing became unlawful needs both.
- Notices name the contact route and the Commissioner as the complaint avenue,
  and name each offshore recipient and country directly.
- **Retention**: soft delete, scheduled purge and legal hold are live. Claimant
  anonymisation and non-document purge are still to build.
- Independent Malaysian counsel review of the consent wording remains our
  standing recommendation; any changes ship as a v2, leaving existing consents
  provably tied to the wording actually agreed.

## 6. What is not built

Stated plainly, because it will come up in a vendor assessment:

| Gap | Position |
|---|---|
| **ISO 27001 / penetration test** | Not held. We understand this is commercially gating and expect to complete it before production onboarding |
| **AMLA / CTF screening** | Not built. Scheduled once counsel confirms whether a registered adjuster is a reporting institution under the AMLA First Schedule |
| eKYC and deepfake detection | Providers not integrated |
| Digital signatures | Provider interface exists; vendor not contracted |
| Production deployment | Staging only. No production environment holds any data |
| Document validation | Stub, and labelled as such in code — no screen presents it as validation performed |

## 7. What we need from MSIG

Two questions, both cheap and both blocking design rather than opinion:

1. **Which channel will appointments arrive through** — Merimen, email, or a
   portal? This determines how the appointment record is built.
2. **Can policy data come as a structured file feed** (SFTP or an agreed inbox
   schema), and can it carry travel dates and flight details? This is the
   sanctioned alternative to any form of portal access, and it is also the
   prerequisite for proactive flight-delay detection. If a feed is not possible,
   the fallback is manual keying of the data already emailed today.

---

*Every claim in this document is traceable to `MASTER_PLAN.md` §3 (compliance
matrix, with current PASS/PARTIAL/FAIL verdicts) and the code it references.
Where the matrix says PARTIAL, this document says so too.*
