-- No persistent fixtures or learner data changes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values('44111111-1111-1111-1111-111111111111','authenticated','authenticated','report-read@test.local','{}','{}');
insert into public.lessons(id,level,title,title_vi,status)
values('report-access-published','A1','Report','Report','published'),
('report-access-draft','A1','Draft','Draft','draft');
insert into public.exercise_sets(id,lesson_id,category,title,status)
values('44111111-1111-1111-1111-111111111111','report-access-published','nguphap','Published','published'),
('44111111-1111-1111-1111-111111111112','report-access-published','nguphap','Draft','draft'),
('44111111-1111-1111-1111-111111111113','report-access-draft','nguphap','Hidden lesson','published');
insert into public.grammar_exercises(lesson_id,set_id,type,prompt_text,correct_answer)
select lesson_id,id,'translation','Report test','secret' from public.exercise_sets
where lesson_id in ('report-access-published','report-access-draft');
set local role service_role;
set local "request.jwt.claims"='{"role":"service_role"}';
select is(auth.uid(),null::uuid,'service JWT has no user sub');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111111'),true,'service can read existing published set');
select is((select count(*) from public.grammar_exercises_public where lesson_id like 'report-access-%'),1::bigint,'service safe view restores published question flags');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111112'),false,'service cannot read draft set');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111113'),false,'service cannot read draft lesson');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111119'),false,'service cannot read nonexistent set');
set local role authenticated;
set local "request.jwt.claims"='{"role":"authenticated","sub":"44111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"},"user_metadata":{"role":"service_role"}}';
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111111'),true,'learner retains published course access');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111112'),false,'learner cannot read draft set or spoof service via metadata');
select is(public.practice_can_read_set('44111111-1111-1111-1111-111111111113'),false,'learner cannot read unpublished lesson');
select is((select count(*) from public.grammar_exercises_public where lesson_id like 'report-access-%'),1::bigint,'learner view exposes only published questions');
reset role;
select is(has_function_privilege('anon','public.practice_can_read_set(uuid)','execute'),false,'anon cannot invoke helper');
select * from finish();
rollback;
