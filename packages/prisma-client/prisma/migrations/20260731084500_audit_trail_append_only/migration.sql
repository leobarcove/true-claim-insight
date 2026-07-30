-- Make audit_trail append-only.
--
-- FSA s.146 allows BNM to examine the firm without notice, and the value of an
-- audit trail in that examination rests entirely on it being untamperable. A
-- table the application can UPDATE is not evidence of what happened; it is
-- evidence of what the application currently says happened.
--
-- Enforced with a trigger rather than by revoking privileges, because the
-- application connects as the table's owner and an owner bypasses REVOKE. A
-- trigger binds regardless of who is connected, including a person with psql.
--
-- UPDATE is never permitted. DELETE is permitted only under an explicit session
-- flag, because PD 12.8 requires records for seven years and something must
-- eventually be able to purge beyond that — a retention policy that can never
-- delete is not a retention policy. Setting the flag is deliberate, auditable in
-- the query itself, and cannot happen by accident:
--
--   BEGIN; SET LOCAL app.audit_maintenance = 'on'; DELETE FROM audit_trail WHERE ...; COMMIT;
CREATE OR REPLACE FUNCTION audit_trail_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.audit_maintenance', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'audit_trail is append-only: % is not permitted. Correct a mistaken entry by inserting a corrective row.', TG_OP
    USING HINT = 'A retention purge must set app.audit_maintenance = ''on'' for the transaction.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_trail_append_only_trigger ON "audit_trail";

CREATE TRIGGER audit_trail_append_only_trigger
  BEFORE UPDATE OR DELETE ON "audit_trail"
  FOR EACH ROW EXECUTE FUNCTION audit_trail_append_only();
