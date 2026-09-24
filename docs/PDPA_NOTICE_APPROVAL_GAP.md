# Gap: PDPA notice approval has no staff UI

**Status:** open  
**Found:** 28 August 2026, local intake on `/chat`  
**Catalogue:** [gaps.html](./gaps.html#g1)  
**Symptom:** after phone verification, chat replies *“Sorry — we cannot start a claim just now. Please contact our support desk.”*  
**Log:** `No approved CLAIM_PROCESSING notice; refusing to start intake.`

## What is missing

Draft consent notices (English and Malay, three purposes) are **seeded unapproved on purpose**. Case-service will not start intake, and will not record consent, until a named person approves a version.

That approval exists only as an internal API on case-service:

`POST /api/v1/consent/notice/:purpose/:version/approve`

Roles: `FIRM_ADMIN`, `COMPLIANCE_OFFICER`, `SUPER_ADMIN`.

It is **not** in the adjuster portal, and the API gateway does not proxy it. Claimant-web has hooks to *show* an already-approved notice and *grant* consent; those hooks are not used on any page. `/chat` will show the wording and capture agreement **only after** a notice is approved.

Until a staff screen exists, every fresh database is blocked at this gate.

## What exists today

| Surface | Behaviour |
| --- | --- |
| `consent_notices` rows (seed / boot) | Draft EN + MS for `CLAIM_PROCESSING`, `BIOMETRIC_ANALYSIS`, `CROSS_BORDER_TRANSFER` — `approvedAt` is null |
| Case-service approve API | Enforces both locales (PDPA s.7), immutability of approved wording, audit row `CONSENT_NOTICE_APPROVED` |
| Adjuster portal | No review or approve screen |
| API gateway | Proxies claimant notice + grant only; no `pending-approval` or approve route |
| `/chat` | Shows the notice and records agreement once a version is approved |

## Local workaround (DBeaver)

Connect: host `localhost`, port `5432`, database `true_claim_insight`, user `tci`, password `localdev`.

```sql
UPDATE consent_notices
SET
  "approvedAt" = NOW(),
  "approvedByUserId" = (SELECT id FROM users WHERE email = 'admin@pacific.com' LIMIT 1)
WHERE "approvedAt" IS NULL;
```

Confirm six rows:

```sql
SELECT purpose, version, locale, "approvedAt"
FROM consent_notices
ORDER BY purpose, locale;
```

No restart is required. In `/chat`, click **Start again**.

This SQL is a local stand-in for the missing UI. It does not write the `CONSENT_NOTICE_APPROVED` audit row the API would.

## Close when

A named staff user (firm admin or compliance) can review the EN/MS wording in the portal and approve a version, which calls the existing case-service endpoint (or an equivalent gateway proxy) and writes the audit row.
