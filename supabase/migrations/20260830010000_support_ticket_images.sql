ALTER TABLE support_ticket_messages
  ADD COLUMN image_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT support_ticket_messages_image_limit
    CHECK (cardinality(image_keys) <= 3);

DROP FUNCTION create_support_ticket(TEXT, TEXT, TEXT);

CREATE FUNCTION create_support_ticket(
  p_title TEXT,
  p_topic TEXT,
  p_body TEXT,
  p_image_keys TEXT[] DEFAULT '{}'
)
RETURNS support_tickets
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t support_tickets;
BEGIN
  INSERT INTO support_tickets (user_id, title, topic)
  VALUES (auth.uid(), p_title, p_topic)
  RETURNING * INTO t;

  INSERT INTO support_ticket_messages (ticket_id, author_id, body, image_keys)
  VALUES (t.id, auth.uid(), p_body, p_image_keys);

  RETURN t;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_support_ticket(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_support_ticket(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
