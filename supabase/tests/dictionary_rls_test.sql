-- Run with supabase test db; every fixture is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(25);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','dictionary-paid@test.local','{}','{"full_name":"Paid"}'),
 ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','dictionary-trial@test.local','{}','{"full_name":"Trial"}'),
 ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','dictionary-expired@test.local','{}','{"full_name":"Expired"}'),
 ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','dictionary-admin@test.local','{}','{"full_name":"Admin"}');
SET LOCAL "request.jwt.claims"='{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';
UPDATE profiles SET unlocked_levels=ARRAY['A1'],subscription_end_date=current_date+30 WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE profiles SET subscription_end_date=NULL WHERE id='22222222-2222-2222-2222-222222222222';
UPDATE profiles SET unlocked_levels=ARRAY['A1'],subscription_end_date=current_date-1 WHERE id='33333333-3333-3333-3333-333333333333';
INSERT INTO modules(id,level,title,title_vi,order_index) VALUES('dictionary-test-module','A1','Test','Test',-1000);
INSERT INTO lessons(id,module_id,level,title,title_vi,status,order_index) VALUES
 ('dictionary-test-1','dictionary-test-module','A1','Test1','Test1','published',1),
 ('dictionary-test-2','dictionary-test-module','A1','Test2','Test2','published',2),
 ('dictionary-test-3','dictionary-test-module','A1','Test3','Test3','published',3),
 ('dictionary-test-4','dictionary-test-module','A1','Test4','Test4','published',4),
 ('dictionary-test-a2','dictionary-test-module','A2','TestA2','TestA2','published',5),
 ('dictionary-test-draft','dictionary-test-module','A1','Draft','Draft','draft',6);
SET LOCAL ROLE authenticated;
INSERT INTO dictionary_topics(id,vi,de) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Dictionary test topic','Test');
INSERT INTO dictionary_entries(id,word,type,article,meaning,course,topics,lessons,status) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Mutter','noun','die','mẹ','A1',ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[],ARRAY['dictionary-test-1'],'published'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','Vater','noun','der','bố','A1',ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[],ARRAY['dictionary-test-4'],'published'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','Kind','noun','das','con','A2',ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[],ARRAY['dictionary-test-a2'],'published'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4','Unfertig','','','','A1','{}','{}','draft');
SELECT save_dictionary_entry('{"word":"Mutter","meaning":"mẹ chỉnh sửa","course":"A1"}', 'draft','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
SELECT is((SELECT meaning FROM dictionary_entries WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),'mẹ','draft keeps live meaning');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":"Bad","course":"A1"}','published')$$,'23514',NULL,'publication validates content');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":"Bad","course":"A1","lessons":["dictionary-test-a2"]}','published')$$,'23514',NULL,'source must match course');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":"Bad","course":"A1","lessons":["dictionary-test-draft"]}','published')$$,'23514',NULL,'source must be published');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":"Bad","type":"phrase","meaning":"x","course":"A1","topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],"lessons":["dictionary-test-1"],"example":"Unpaired"}','published')$$,'23514',NULL,'example requires translation');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":" mutter ","type":"noun","article":"die","meaning":"mẹ","course":"A1","topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],"lessons":["dictionary-test-1"]}','published')$$,'23505',NULL,'duplicate identity rejected');
SET LOCAL "request.jwt.claims"='{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
SELECT is((SELECT count(*) FROM dictionary_entries WHERE id::text LIKE 'bbbbbbbb-%'),2::bigint,'paid A1 reads future source words too');
SELECT is((SELECT count(*) FROM dictionary_entry_drafts),0::bigint,'learner cannot read editorial drafts');
SELECT throws_ok($$SELECT save_dictionary_entry('{"word":"Bad","course":"A1"}','draft')$$,'42501','Admin required','learner cannot edit dictionary');
INSERT INTO dictionary_bookmarks(user_id,entry_id) VALUES(auth.uid(),'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
SELECT throws_ok($$INSERT INTO dictionary_bookmarks(user_id,entry_id) VALUES('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')$$,'42501',NULL,'bookmark owner cannot be forged');
SELECT is((SELECT count(*) FROM dictionary_bookmarks),1::bigint,'owner sees bookmark');
SET LOCAL "request.jwt.claims"='{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"trial"}}';
SELECT is((SELECT count(*) FROM dictionary_entries WHERE id::text LIKE 'bbbbbbbb-%'),1::bigint,'trial sees first three source lessons');
SELECT is((SELECT count(*) FROM dictionary_bookmarks),0::bigint,'other learner bookmark hidden');
SET LOCAL "request.jwt.claims"='{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';
SELECT is((SELECT count(*) FROM dictionary_entries),0::bigint,'expired course hidden');
SELECT is((SELECT count(*) FROM dictionary_topics),0::bigint,'inaccessible topics hidden');
SET LOCAL "request.jwt.claims"='{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"tutor"}}';
SELECT is((SELECT count(*) FROM dictionary_entries WHERE id::text LIKE 'bbbbbbbb-%'),3::bigint,'Tutor reads published only');
SELECT is((SELECT count(*) FROM dictionary_entry_drafts),0::bigint,'Tutor cannot read editorial drafts');
SELECT throws_ok($$INSERT INTO dictionary_topics(vi) VALUES('Blocked')$$,'42501',NULL,'Tutor cannot edit topics');
SET LOCAL "request.jwt.claims"='{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';
SELECT save_dictionary_entry('{"word":"Mutter","type":"noun","article":"die","meaning":"mẹ chỉnh sửa","course":"A1","topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],"lessons":["dictionary-test-1"]}', 'published','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
SELECT is((SELECT count(*) FROM dictionary_entry_drafts),0::bigint,'republish clears private draft');
SELECT is((SELECT meaning FROM dictionary_entries WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),'mẹ chỉnh sửa','republish changes live meaning');
INSERT INTO storage.objects(bucket_id,name) VALUES('dictionary-audio','99999999-9999-9999-9999-999999999999/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3');
SELECT save_dictionary_entry('{"word":"Audio","type":"phrase","meaning":"âm thanh","course":"A1","topics":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],"lessons":["dictionary-test-1"],"audio":"99999999-9999-9999-9999-999999999999/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3"}','published');
SET LOCAL "request.jwt.claims"='{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id='dictionary-audio'),1::bigint,'accessible audio readable');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('dictionary-audio','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3')$$,'42501',NULL,'learner cannot upload dictionary audio');
SET LOCAL "request.jwt.claims"='{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id='dictionary-audio'),0::bigint,'expired user cannot read audio');
RESET ROLE;
SELECT is(has_function_privilege('anon','public.save_dictionary_entry(jsonb,text,uuid)','execute'),false,'anon cannot call publish RPC');
SELECT is(has_function_privilege('authenticated','public.validate_dictionary_entry()','execute'),false,'trigger is not a client RPC');
SELECT * FROM finish();
ROLLBACK;
