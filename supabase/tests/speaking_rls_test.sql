-- Run with supabase test db. All fixtures are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
select ok((select 'audio/x-m4a'=any(allowed_mime_types) from storage.buckets where id='speaking-recordings'),'M4A detected MIME type is allowed');
-- Test the actual DELETE policy without issuing direct SQL DELETE against Storage.
-- Storage protects direct metadata deletion; binary deletion belongs to its API.
create function pg_temp.speaking_can_delete(object_path text) returns boolean
language plpgsql security invoker as $$
declare predicate text; permitted boolean;
begin
  select qual into predicate from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='speaking audio: remove unused upload';
  execute 'select (' || predicate || ') from storage.objects where name=$1'
    into permitted using object_path;
  return permitted;
end;
$$;
select is(has_function_privilege('anon','public.enforce_speaking_submission()','execute'),false,'anon cannot invoke guard RPC');
select is(has_function_privilege('authenticated','public.enforce_speaking_submission()','execute'),false,'learner cannot invoke guard RPC');
select is(has_function_privilege('anon','public.notify_speaking_submission()','execute'),false,'anon cannot invoke notification RPC');
select is(has_function_privilege('authenticated','public.notify_speaking_submission()','execute'),false,'learner cannot invoke notification RPC');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','speaking-a@test.local','{}','{"full_name":"A"}'),
('22222222-2222-2222-2222-222222222222','authenticated','authenticated','speaking-b@test.local','{}','{"full_name":"B"}');
insert into public.lessons(id,level,title,title_vi,status,speaking_md)
values ('speaking-test','A1','Speaking','Nói','published','Speak');
insert into storage.objects(bucket_id,name)
select 'speaking-recordings','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-00000000000' || n || '.m4a'
from generate_series(1,3) n;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';
select throws_ok($$insert into speaking_submissions(lesson_id,user_id,object_key,file_name,score,graded_at)
values ('speaking-test',auth.uid(),'11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-000000000001.m4a','voice.m4a',90,now())$$,
'42501',null,'learner cannot forge grade');
insert into speaking_submissions(lesson_id,user_id,object_key,file_name)
select 'speaking-test',auth.uid(),'11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-00000000000' || n || '.m4a','voice.m4a'
from generate_series(1,2) n;
select is((select count(*) from speaking_submissions where lesson_id='speaking-test'),2::bigint,'owner sees both attempts');
select throws_ok($$insert into speaking_submissions(lesson_id,user_id,object_key,file_name)
values ('speaking-test',auth.uid(),'11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-000000000003.m4a','voice.m4a')$$,
'23514','speaking attempt limit reached','third attempt rejected');
update speaking_submissions set score=90,graded_at=now() where lesson_id='speaking-test';
select is((select count(*) from speaking_submissions where lesson_id='speaking-test' and score is not null),0::bigint,'learner cannot grade');
select is(pg_temp.speaking_can_delete('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-000000000001.m4a'),false,'submitted audio cannot be removed');
select is(pg_temp.speaking_can_delete('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-000000000003.m4a'),true,'unused audio may be removed');
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"user"}}';
select is((select count(*) from speaking_submissions where lesson_id='speaking-test'),0::bigint,'other learner cannot read attempts');
select is((select count(*) from storage.objects where bucket_id='speaking-recordings' and name like '11111111-1111-1111-1111-111111111111/%'),0::bigint,'other learner cannot read audio');
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"tutor"}}';
select is((select count(*) from speaking_submissions where lesson_id='speaking-test'),2::bigint,'tutor sees attempts');
select is((select count(*) from storage.objects where bucket_id='speaking-recordings' and name like '11111111-1111-1111-1111-111111111111/%'),2::bigint,'tutor can read audio');
select throws_ok($$update speaking_submissions set file_name='changed.m4a' where lesson_id='speaking-test'$$,
'23514','speaking submission is immutable','staff cannot change submission identity');
select throws_ok($$update speaking_submissions set score=101,graded_at=now() where lesson_id='speaking-test'$$,
'23514',null,'score cannot exceed 100');
update speaking_submissions set score=90,comment='Good',graded_at=now() where lesson_id='speaking-test';
set local role postgres;
select is((select count(*) from notifications where lesson_id='speaking-test' and type='speaking_submitted'),2::bigint,'staff notified for both attempts');
select is((select count(*) from notifications where lesson_id='speaking-test' and type='speaking_graded'),2::bigint,'learner notified for both grades');
select * from finish();
rollback;
