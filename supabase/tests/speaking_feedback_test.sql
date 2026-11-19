-- Transactional fixtures only: run with supabase test db.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
create function pg_temp.feedback_can_delete(object_path text) returns boolean
language plpgsql security invoker as $$
declare predicate text; permitted boolean;
begin
  select qual into predicate from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='speaking feedback: staff remove unused';
  execute 'select (' || predicate || ') from storage.objects where name=$1' into permitted using object_path;
  return permitted;
end;
$$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('33333333-3333-3333-3333-333333333333','authenticated','authenticated','feedback-a@test.local','{}','{}'),
('44444444-4444-4444-4444-444444444444','authenticated','authenticated','feedback-b@test.local','{}','{}');
insert into public.lessons(id,level,title,title_vi,status,speaking_md) values ('feedback-test','A1','Feedback','Phản hồi','published','Speak');
insert into storage.objects(bucket_id,name) values
('speaking-recordings','33333333-3333-3333-3333-333333333333/aaaa.m4a'),
('speaking-recordings','33333333-3333-3333-3333-333333333333/bbbb.mp3');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';
select throws_ok($$insert into speaking_submissions(id,lesson_id,user_id,object_key,file_name,feedback_object_key,feedback_file_name)
values ('55555555-5555-5555-5555-555555555555','feedback-test',auth.uid(),'33333333-3333-3333-3333-333333333333/aaaa.m4a','a.m4a','feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3','a.mp3')$$,
'23514','speaking feedback requires staff grading','learner cannot forge feedback on insert');
insert into speaking_submissions(id,lesson_id,user_id,object_key,file_name) values
('55555555-5555-5555-5555-555555555555','feedback-test',auth.uid(),'33333333-3333-3333-3333-333333333333/aaaa.m4a','a.m4a'),
('66666666-6666-6666-6666-666666666666','feedback-test',auth.uid(),'33333333-3333-3333-3333-333333333333/bbbb.mp3','b.mp3');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('speaking-recordings','feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3')$$,'42501',null,'learner cannot upload teacher audio');
set local "request.jwt.claims"='{"sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"role":"tutor"}}';
select lives_ok($$insert into storage.objects(bucket_id,name) values
('speaking-recordings','feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3'),
('speaking-recordings','feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a'),
('speaking-recordings','feedback/66666666-6666-6666-6666-666666666666/aaaa.mp3')$$,'staff uploads feedback within submission namespaces');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('speaking-recordings','feedback/77777777-7777-7777-7777-777777777777/aaaa.mp3')$$,'42501',null,'unknown submission upload denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('speaking-recordings','feedback/55555555-5555-5555-5555-555555555555/aaaa.html')$$,'42501',null,'unsupported extension denied');
select throws_ok($$update speaking_submissions set score=0,graded_at=now(),feedback_object_key='feedback/55555555-5555-5555-5555-555555555555/cccc.mp3',feedback_file_name='c.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'23514','speaking feedback recording not found','missing feedback object rejected');
select throws_ok($$update speaking_submissions set score=0,graded_at=now(),feedback_object_key='feedback/66666666-6666-6666-6666-666666666666/aaaa.mp3',feedback_file_name='a.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'23514',null,'feedback from another attempt rejected');
select throws_ok($$update speaking_submissions set feedback_object_key='feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3',feedback_file_name='a.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'23514',null,'ungraded feedback rejected');
select throws_ok($$update speaking_submissions set score=0,graded_at=now(),feedback_file_name='a.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'23514',null,'unpaired feedback rejected');
select lives_ok($$update speaking_submissions set score=0,graded_at=now(),comment=null,feedback_object_key='feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3',feedback_file_name='a.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'audio-only feedback and score zero accepted');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3'),false,'attached feedback cannot be deleted, including lost update response');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a'),true,'unused uploaded feedback can be cleaned');
select throws_ok($$update speaking_submissions set file_name='changed.mp3' where id='55555555-5555-5555-5555-555555555555'$$,'23514','speaking submission is immutable','identity stays immutable');
set local "request.jwt.claims"='{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';
select is((select count(*) from storage.objects where bucket_id='speaking-recordings' and (name like 'feedback/55555555-5555-5555-5555-555555555555/%' or name like 'feedback/66666666-6666-6666-6666-666666666666/%')),1::bigint,'owner reads attached feedback only');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3'),false,'owner cannot delete feedback');
update speaking_submissions set feedback_object_key=null,feedback_file_name=null where id='55555555-5555-5555-5555-555555555555';
select is((select feedback_file_name from speaking_submissions where id='55555555-5555-5555-5555-555555555555'),'a.mp3','owner cannot change feedback');
set local "request.jwt.claims"='{"sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"role":"user"}}';
select is((select count(*) from storage.objects where bucket_id='speaking-recordings' and (name like 'feedback/55555555-5555-5555-5555-555555555555/%' or name like 'feedback/66666666-6666-6666-6666-666666666666/%')),0::bigint,'another learner cannot read feedback');
set local "request.jwt.claims"='{"sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"role":"admin"}}';
select is((select count(*) from storage.objects where bucket_id='speaking-recordings' and (name like 'feedback/55555555-5555-5555-5555-555555555555/%' or name like 'feedback/66666666-6666-6666-6666-666666666666/%')),3::bigint,'staff reads attached and draft feedback');
select lives_ok($$update speaking_submissions set comment='Good',feedback_object_key='feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a',feedback_file_name='b.m4a' where id='55555555-5555-5555-5555-555555555555'$$,'replacement with written comment accepted');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/aaaa.mp3'),true,'old object becomes deletable after replacement');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a'),false,'replacement remains protected');
select lives_ok($$update speaking_submissions set feedback_object_key=null,feedback_file_name=null where id='55555555-5555-5555-5555-555555555555'$$,'audio removal keeps written grade');
select is((select score from speaking_submissions where id='55555555-5555-5555-5555-555555555555'),0,'removal preserves score zero');
select is(pg_temp.feedback_can_delete('feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a'),true,'removed object becomes deletable');
select is(has_function_privilege('authenticated','public.enforce_speaking_submission()','execute'),false,'guard remains unavailable as RPC');
select is(has_function_privilege('anon','public.can_delete_speaking_feedback(text)','execute'),false,'anon cannot call cleanup predicate');
select is(has_function_privilege('authenticated','public.can_delete_speaking_feedback(text)','execute'),true,'authenticated needs execute for DELETE policy');
select is(public.can_delete_speaking_feedback('33333333-3333-3333-3333-333333333333/aaaa.m4a'),false,'cleanup predicate never authorizes original recordings');
set local "request.jwt.claims"='{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';
select is(public.can_delete_speaking_feedback('feedback/55555555-5555-5555-5555-555555555555/bbbb.m4a'),false,'learner RPC cannot authorize cleanup');
select * from finish();
rollback;
