begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select lives_ok($test$
do $checks$
declare
  learner uuid := '55111111-1111-1111-1111-111111111111';
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  first_plan public.level_learning_plans;
  next_plan public.level_learning_plans;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role","app_metadata":{"role":"admin"}}', true);
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(learner,'authenticated','authenticated','learning-plan@test.local','{}','{}');
  update public.profiles set role='trial', unlocked_levels=array['A1'], subscription_end_date=today+90 where id=learner;
  insert into public.modules(id,level,title,title_vi) values('lp-test','A1','Plan','Plan');
  insert into public.lessons(id,module_id,level,title,title_vi,status,order_index)
    values('lp-done','lp-test','A1','Done','Done','published',1),
      ('lp-next','lp-test','A1','Next','Next','published',2);
  insert into public.exercise_sets(id,lesson_id,category,title,status)
    values('55111111-1111-1111-1111-111111111112','lp-done','nguphap','Done','published'),
      ('55111111-1111-1111-1111-111111111113','lp-next','nguphap','Next','published');
  insert into public.grammar_exercises(lesson_id,set_id,type,prompt_text,correct_answer)
    values('lp-done','55111111-1111-1111-1111-111111111112','translation','Done','Ja'),
      ('lp-next','55111111-1111-1111-1111-111111111113','translation','Next','Ja');
  insert into public.lesson_progress(user_id,lesson_id,category,quiz_score,completed_at)
    values(learner,'lp-done','nguphap',80,now());
  insert into public.level_enrollments(user_id,level,started_at,planned_completion_date)
    values(learner,'A1',today,today+90);
  update public.profiles set role='user' where id=learner;
  select * into strict first_plan from public.level_learning_plans where user_id=learner;
  assert first_plan.completed_lesson_ids @> array['lp-done'], 'initial C0 snapshots existing completions';
  assert not first_plan.completed_lesson_ids @> array['lp-next'], 'unfinished lessons excluded from C0';
  assert first_plan.lesson_scope @> '[{"id":"lp-next","hasNguphapQuestions":true}]', 'question requirements are frozen';

  insert into public.lessons(id,module_id,level,title,title_vi,status)
    values('lp-new','lp-test','A1','New','New','published');
  insert into public.lesson_progress(user_id,lesson_id,category,quiz_score,completed_at)
    values(learner,'lp-next','nguphap',90,now());
  assert not (select lesson_scope @> '[{"id":"lp-new"}]' from public.level_learning_plans where id=first_plan.id), 'scope stays fixed';
  assert not (select completed_lesson_ids @> array['lp-next'] from public.level_learning_plans where id=first_plan.id), 'C0 stays fixed';

  update public.profiles set subscription_end_date=today+120 where id=learner;
  select * into strict next_plan from public.level_learning_plans where user_id=learner order by id desc limit 1;
  assert next_plan.id > first_plan.id and next_plan.started_at=today and next_plan.planned_completion_date=today+120, 'early extension includes remaining old days';
  assert next_plan.completed_lesson_ids @> array['lp-done','lp-next'], 'new C0 captures completion at extension';
  assert next_plan.lesson_scope @> '[{"id":"lp-new"}]', 'replan establishes new scope';
  assert (select count(*) from public.level_learning_plans where user_id=learner)=2, 'old plan retained';
  update public.profiles set full_name='Unrelated change' where id=learner;
  assert (select count(*) from public.level_learning_plans where user_id=learner)=2, 'unrelated updates do not reset C0';
  update public.profiles set unlocked_levels=array['A1','A2'] where id=learner;
  update public.profiles set subscription_end_date=today+150 where id=learner;
  assert exists(select 1 from public.level_learning_plans where user_id=learner and level='A2' and started_at=today and planned_completion_date=today+150), 'missing enrollment is created at extension time';
  assert (select count(*) from public.level_learning_plans where user_id=learner and level='A1')=3, 'repeat extension on same day retains versions';
  update public.profiles set subscription_end_date=today-1 where id=learner;
  update public.profiles set subscription_end_date=today+45 where id=learner;
  assert (select count(*) from public.level_learning_plans where user_id=learner and level='A1')=4, 'late extension creates new plan';
  assert (select planned_completion_date from public.level_learning_plans where id=first_plan.id)=today+90, 'historical deadline preserved';

  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"55111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}', true);
  set local role authenticated;
  assert (select count(*) from public.level_learning_plans where user_id=learner)=6, 'learner can read own history';
  assert not has_table_privilege('authenticated','public.level_learning_plans','INSERT'), 'learner cannot forge snapshots';
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"55222222-2222-2222-2222-222222222222"}', true);
  assert (select count(*) from public.level_learning_plans where user_id=learner)=0, 'other learners cannot read history';
  reset role;
  assert not has_table_privilege('anon','public.level_learning_plans','SELECT'), 'anonymous cannot read history';
  assert not has_function_privilege('authenticated','private.capture_level_learning_plan(public.level_enrollments,timestamptz)','EXECUTE'), 'private snapshot helper not callable';
end $checks$;
$test$, 'plan snapshots, repeated early/late extensions, frozen scope and RLS');
select * from finish();
rollback;
