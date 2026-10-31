BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE FUNCTION pg_temp.delete_record(table_name text,record_id uuid) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE affected bigint;
BEGIN EXECUTE format('DELETE FROM public.%I WHERE id=$1',table_name) USING record_id;
GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected; END;
$$;
SELECT plan(9);
SELECT ok(has_table_privilege('authenticated','public.dictionary_entries','DELETE'),'authenticated has DELETE subject to RLS');
SET LOCAL "request.jwt.claims"='{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';
INSERT INTO dictionary_topics(id,vi) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad1','Delete unused'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad2','Delete used'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad3','Delete draft used');
INSERT INTO dictionary_entries(id,word,course,topics) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1','Delete entry','A1',ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad2']::uuid[]);
INSERT INTO dictionary_entry_drafts(entry_id,content) VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1','{"word":"Draft", "topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad3"]}');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims"='{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
SELECT is(pg_temp.delete_record('dictionary_entries','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1'),0::bigint,'learner cannot delete entries');
SELECT is(pg_temp.delete_record('dictionary_topics','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad1'),0::bigint,'learner cannot delete topics');
SET LOCAL "request.jwt.claims"='{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';
SELECT throws_ok($$INSERT INTO dictionary_entry_drafts(entry_id,content) VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1','{"word":"Bad draft","topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad4"]}') ON CONFLICT(entry_id) DO UPDATE SET content=excluded.content$$,'23514','dictionary topic not found','stale editor cannot save a deleted topic');
SELECT throws_ok($$DELETE FROM dictionary_topics WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad2'$$,'23503',NULL,'topic used by entry cannot be deleted');
SELECT throws_ok($$DELETE FROM dictionary_topics WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad3'$$,'23503',NULL,'topic used by saved draft cannot be deleted');
SELECT is(pg_temp.delete_record('dictionary_entries','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1'),1::bigint,'admin deletes entry');
SELECT is((SELECT count(*) FROM dictionary_entry_drafts WHERE entry_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbd1'),0::bigint,'entry draft cascades');
SELECT is(pg_temp.delete_record('dictionary_topics','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad1'),1::bigint,'admin deletes unused topic');
SELECT * FROM finish();
ROLLBACK;
