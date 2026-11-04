-- All fixtures roll back. Run after independent_practice migration.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values('33111111-1111-1111-1111-111111111111','authenticated','authenticated','practice-a@test.local','{}','{}'),
('33222222-2222-2222-2222-222222222222','authenticated','authenticated','practice-b@test.local','{}','{}');
insert into public.lessons(id,level,title,title_vi,status,content_scope,practice_category,xp_reward)
values ('practice-test','A1','Topic','Chủ đề','published','practice','nguphap',0),
('practice-test-hidden','A1','Hidden','Ẩn','draft','practice','nghe',0),
('practice-test-a2','A2','Locked','Khóa','published','practice','doc',0),
('practice-main-test','A1','Main','Bài học','published','lesson',null,15);
insert into public.exercise_sets(id,lesson_id,category,title,status,transcription)
values ('33111111-1111-1111-1111-111111111111','practice-test','nguphap','Set','draft','secret'),
('33111111-1111-1111-1111-111111111112','practice-test','nguphap','Draft','draft','draft secret'),
('33111111-1111-1111-1111-111111111113','practice-test-hidden','nghe','Hidden','draft','hidden secret'),
('33111111-1111-1111-1111-111111111114','practice-test-a2','doc','Locked','draft',null);
insert into public.grammar_exercises(lesson_id,set_id,type,prompt_text,correct_answer)
values ('practice-test','33111111-1111-1111-1111-111111111111','translation','Ja','secret answer'),
('practice-test','33111111-1111-1111-1111-111111111112','translation','Draft','secret draft answer');
insert into public.listening_clips(id,lesson_id,r2_key) values('33111111-1111-1111-1111-111111111115','practice-test-hidden','secret.mp3');
insert into public.listening_clips(id,lesson_id,r2_key) values
('33111111-1111-1111-1111-111111111116','practice-test','published.mp3'),
('33111111-1111-1111-1111-111111111117','practice-test','draft.mp3');
update public.exercise_sets set audio_clip_id='33111111-1111-1111-1111-111111111116' where id='33111111-1111-1111-1111-111111111111';
update public.exercise_sets set audio_clip_id='33111111-1111-1111-1111-111111111117' where id='33111111-1111-1111-1111-111111111112';
update public.grammar_exercises set prompt_text='images/practice-test/published.png' where set_id='33111111-1111-1111-1111-111111111111';
update public.grammar_exercises set prompt_text='images/practice-test/draft.png' where set_id='33111111-1111-1111-1111-111111111112';
update public.exercise_sets set status='published' where id='33111111-1111-1111-1111-111111111111';
select throws_ok($$insert into public.lessons(id,level,title,title_vi,content_scope,practice_category) values('practice-invalid','A1','X','X','practice','doc')$$,'23514',null,'practice cannot retain XP');
select throws_ok($$insert into public.exercise_sets(lesson_id,category,title) values('practice-test','doc','wrong')$$,'23514',null,'set category must inherit topic');
select throws_ok($$update public.lessons set level='A2' where id='practice-test'$$,'23514',null,'practice level cannot drift from children');
select throws_ok($$insert into public.lesson_progress(user_id,lesson_id,category) values('33111111-1111-1111-1111-111111111111','practice-test','nguphap')$$,'23514',null,'practice progress blocked even for service writes');
select throws_ok($$update public.lessons set next_lesson_id='practice-test' where id='practice-main-test'$$,'23514',null,'course cannot unlock practice as next lesson');
insert into public.exercise_set_attempts(user_id,set_id,category,answers,score,total,best_score,is_passed,revealed,last_submission_id)
values('33111111-1111-1111-1111-111111111111','33111111-1111-1111-1111-111111111111','nguphap','{}',0,1,0,false,false,'first');
update public.exercise_set_attempts set last_submission_id='second',attempt_count=2 where set_id='33111111-1111-1111-1111-111111111111';
update public.exercise_set_attempts set last_submission_id='second' where set_id='33111111-1111-1111-1111-111111111111';
select is((select count(*) from public.practice_submission_history where set_id='33111111-1111-1111-1111-111111111111'),2::bigint,'append history deduplicates request IDs');
do $$ begin
 perform public.save_practice_attempt('33111111-1111-1111-1111-111111111111','33111111-1111-1111-1111-111111111111','third','{}',1,1,'{}');
 perform public.save_practice_attempt('33111111-1111-1111-1111-111111111111','33111111-1111-1111-1111-111111111111','fourth','{}',0,1,'{}');
end $$;
select is((public.save_practice_attempt('33111111-1111-1111-1111-111111111111','33111111-1111-1111-1111-111111111111','third','{}',0,1,'{}')->>'attempt_count')::integer,3,'old request replay returns original history');
select is((select attempt_count from public.exercise_set_attempts where set_id='33111111-1111-1111-1111-111111111111'),4,'replay never overwrites latest attempt');
select is((select best_score from public.exercise_set_attempts where set_id='33111111-1111-1111-1111-111111111111'),100,'atomic save keeps best score');
select is((select is_passed from public.exercise_set_attempts where set_id='33111111-1111-1111-1111-111111111111'),true,'atomic save retains passed status after retry');
select throws_ok($$update public.exercise_sets set status='published' where id='33111111-1111-1111-1111-111111111114'$$,'23514',null,'empty practice cannot publish');
select is(has_function_privilege('authenticated','public.save_practice_attempt(uuid,uuid,text,jsonb,integer,integer,jsonb)','execute'),false,'learner cannot invoke service grading persistence');
select is((select count(*) from public.lesson_positions where id='practice-test'),0::bigint,'practice excluded from main positions');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"33111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
select is((select count(*) from public.practice_catalog() where topic_id='practice-test'),1::bigint,'trial A1 can discover published practice');
select is((select jsonb_array_length(sets) from public.practice_catalog() where topic_id='practice-test'),1,'catalog omits draft set');
select is((select sets->0->>'transcription' from public.practice_catalog() where topic_id='practice-test'),null::text,'catalog never exposes transcription');
select is((select sets->0->>'audio_r2_key' from public.practice_catalog() where topic_id='practice-test'),'published.mp3','catalog includes published set audio');
select is((select count(*) from public.listening_clips where lesson_id='practice-test'),1::bigint,'draft set audio withheld inside published topic');
select is(public.practice_can_read_image('practice-test','images/practice-test/published.png'),true,'published question image accessible');
select is(public.practice_can_read_image('practice-test','images/practice-test/draft.png'),false,'draft question image denied');
select is(public.practice_can_read_image('practice-test','images/practice-test/unreferenced.png'),false,'unreferenced image denied');
select is((select sets->0->'question_types' from public.practice_catalog() where topic_id='practice-test'),'["translation"]'::jsonb,'catalog identifies existing question type');
select is((select count(*) from public.exercise_sets where lesson_id='practice-test'),0::bigint,'raw practice sets withheld from learners');
select is((select count(*) from public.grammar_exercises_public where lesson_id='practice-test'),1::bigint,'safe runner view exposes published practice questions');
select is((select count(*) from public.practice_catalog() where topic_id='practice-test-hidden'),0::bigint,'draft topic absent');
select is((select count(*) from public.practice_catalog() where topic_id='practice-test-a2'),0::bigint,'locked A2 absent');
select is((select count(*) from public.listening_clips where lesson_id='practice-test-hidden'),0::bigint,'unpublished practice media blocked');
select is((select count(*) from public.practice_submission_history where set_id='33111111-1111-1111-1111-111111111111'),4::bigint,'owner sees history');
select throws_ok($$insert into public.practice_submission_history(user_id,set_id,submission_id,answers,score,total,is_passed,revealed,attempt_count,best_score,results) values(auth.uid(),'33111111-1111-1111-1111-111111111111','forged','{}',100,1,true,true,1,100,'{}')$$,'42501',null,'learner cannot forge grade history');
select throws_ok($$update public.practice_submission_history set score=100$$,'42501',null,'history cannot be rewritten by learner');
select throws_ok($$select public.reorder_practice_sets('practice-test',ARRAY['33111111-1111-1111-1111-111111111111'::uuid])$$,'42501',null,'learner cannot reorder');
set local "request.jwt.claims"='{"sub":"33222222-2222-2222-2222-222222222222","app_metadata":{"role":"user"}}';
select is((select count(*) from public.practice_submission_history where set_id='33111111-1111-1111-1111-111111111111'),0::bigint,'other learner cannot read history');
set local role postgres;
update public.profiles set subscription_end_date=current_date-1 where id='33111111-1111-1111-1111-111111111111';
set local role authenticated;
set local "request.jwt.claims"='{"sub":"33111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
select is((select count(*) from public.practice_catalog() where topic_id='practice-test'),0::bigint,'expired paid account cannot use trial fallback');
select is((select count(*) from public.grammar_exercises_public where lesson_id='practice-test'),0::bigint,'expired access blocked at question view');
set local "request.jwt.claims"='{"sub":"33111111-1111-1111-1111-111111111111","app_metadata":{"role":"admin"}}';
select lives_ok($$select public.reorder_practice_sets('practice-test',ARRAY['33111111-1111-1111-1111-111111111112'::uuid,'33111111-1111-1111-1111-111111111111'::uuid])$$,'staff can reorder full topic');
select is((select title from public.exercise_sets where id='33111111-1111-1111-1111-111111111111'),'Set','reorder preserves authored title');
select * from finish();
rollback;
