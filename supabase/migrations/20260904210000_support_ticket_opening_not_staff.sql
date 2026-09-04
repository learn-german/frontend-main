-- Opening message is the ticket body from the requester, never a staff reply.
-- Without this, an admin testing via the learner Support page gets is_staff=true
-- on the first message and the after-insert trigger marks the ticket resolved.
CREATE OR REPLACE FUNCTION support_message_set_is_staff()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM support_ticket_messages WHERE ticket_id = NEW.ticket_id
  ) THEN
    NEW.is_staff := false;
  ELSE
    NEW.is_staff := COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin', false);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Repair the known buggy pattern: sole message wrongly marked staff → auto-resolved.
-- Do not touch tickets an admin marked resolved by hand (opening message is_staff=false).
UPDATE support_tickets t
   SET status = 'pending'
 WHERE t.status = 'resolved'
   AND (SELECT count(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) = 1
   AND (SELECT m.is_staff FROM support_ticket_messages m WHERE m.ticket_id = t.id LIMIT 1) = true;

UPDATE support_ticket_messages m
   SET is_staff = false
 WHERE m.is_staff = true
   AND (SELECT count(*) FROM support_ticket_messages x WHERE x.ticket_id = m.ticket_id) = 1;
