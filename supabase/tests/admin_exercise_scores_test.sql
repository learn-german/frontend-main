BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('dddddddd-dddd-dddd-dddd-ddddddddddd1','authenticated','authenticated','score-probe@test.local','{}','{"full_name":"Score probe"}');
INSERT INTO lessons(id,level,title,title_vi,status) VALUES('score-probe','A1','Score probe','Score probe','published');
CREATE TEMP TABLE score_sets AS SELECT gen_random_uuid() id,category,status,nonempty FROM (VALUES
('nguphap','published',true),('nguphap','published',true),('nghe','published',true),('nghe','published',true),('doc','published',true),('doc','published',true),('nguphap','draft',true),('nguphap','published',false)) v(category,status,nonempty);
INSERT INTO exercise_sets(id,lesson_id,category,title,status) SELECT id,'score-probe',category,'Score probe',status FROM score_sets;
INSERT INTO grammar_exercises(lesson_id,set_id,type,prompt_text,correct_answer)
SELECT 'score-probe',id,'sentence_transformation','Probe','Probe' FROM score_sets WHERE category<>'doc' AND nonempty;
INSERT INTO reading_passages(id,lesson_id,text_de) VALUES('cccccccc-cccc-cccc-cccc-ccccccccccc1','score-probe','Probe');
INSERT INTO reading_question_groups(passage_id,set_id,question_type,statements)
SELECT 'cccccccc-cccc-cccc-cccc-ccccccccccc1',id,'richtig_falsch','[{"id":"probe","text":"Probe","correct_answer":true}]' FROM score_sets WHERE category='doc';
INSERT INTO exercise_set_attempts(user_id,set_id,category,answers,score,total,best_score,is_passed,last_submission_id)
SELECT 'dddddddd-dddd-dddd-dddd-ddddddddddd1',id,category,'{}',80,100,CASE WHEN status='draft' OR NOT nonempty THEN 100 ELSE 80 END,true,'probe-'||id::text FROM score_sets;
INSERT INTO lesson_progress(user_id,lesson_id,category,quiz_score) VALUES('dddddddd-dddd-dddd-dddd-ddddddddddd1','score-probe','nguphap',100);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims"='{"sub":"dddddddd-dddd-dddd-dddd-ddddddddddd1","app_metadata":{"role":"user"}}';
SELECT throws_ok($$SELECT * FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1')$$,'42501','Staff required','learner cannot read staff summary');
SET LOCAL "request.jwt.claims"='{"sub":"dddddddd-dddd-dddd-dddd-ddddddddddd1","app_metadata":{}}';
SELECT throws_ok($$SELECT * FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1')$$,'42501','Staff required','missing role cannot read staff summary');
SET LOCAL "request.jwt.claims"='{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"tutor"}}';
SELECT is((SELECT quiz_score FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1') WHERE lesson_id='score-probe' AND category='nguphap'),80,'grammar average stays 80 after PASS and ignores empty/draft sets');
SELECT is((SELECT quiz_score FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1') WHERE lesson_id='score-probe' AND category='nghe'),80,'listening average stays 80');
SELECT is((SELECT quiz_score FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1') WHERE lesson_id='score-probe' AND category='doc'),80,'reading average stays 80');
SET LOCAL ROLE postgres;
INSERT INTO exercise_sets(id,lesson_id,category,title,status) VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb51','score-probe','nguphap','Unattempted','published');
INSERT INTO grammar_exercises(lesson_id,set_id,type,prompt_text,correct_answer) VALUES('score-probe','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb51','sentence_transformation','Probe','Probe');
SET LOCAL ROLE authenticated;
SELECT is((SELECT quiz_score FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1') WHERE lesson_id='score-probe' AND category='nguphap'),53,'unattempted published set contributes zero');
SET LOCAL ROLE postgres;
SELECT is((SELECT quiz_score FROM lesson_progress WHERE user_id='dddddddd-dddd-dddd-dddd-ddddddddddd1' AND lesson_id='score-probe' AND category='nguphap'),100,'completion sentinel unchanged');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM admin_exercise_score_summary('dddddddd-dddd-dddd-dddd-ddddddddddd1')$$,'42501',NULL,'anonymous cannot call summary');
SET LOCAL ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
