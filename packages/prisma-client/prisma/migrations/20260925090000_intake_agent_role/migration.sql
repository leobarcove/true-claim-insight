-- The intake agent: a role for taking a claim in on a claimant's behalf, and
-- nothing else. PIAM-registered agents signed in as ADJUSTER until now, which
-- under TENANT_ROLES either refused them outright (an agency onboarded as an
-- insurer) or handed them adjusting work they may not do (PD 5.2 — an agent is
-- not an adjusting employee). See @tci/shared-types access-policy.ts.
--
-- ActorType gains the value too: the audit trail records the acting role, and
-- an enum it could not hold would fail the audit write the act depends on.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INTAKE_AGENT';
ALTER TYPE "ActorType" ADD VALUE IF NOT EXISTS 'INTAKE_AGENT' BEFORE 'SYSTEM';
