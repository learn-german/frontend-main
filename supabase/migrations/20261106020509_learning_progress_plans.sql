-- Fixed lesson scope and C0 for every enrollment window. No historical reports are rewritten.
create table public.level_learning_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null,
  started_at date not null,
  planned_completion_date date not null check (planned_completion_date > started_at),
  lesson_scope jsonb not null check (jsonb_typeof(lesson_scope) = 'array'),
  completed_lesson_ids text[] not null,
  created_at timestamptz not null default now()
);
create index level_learning_plans_user_level_idx on public.level_learning_plans(user_id, level, id desc);
alter table public.level_learning_plans enable row level security;
revoke all on public.level_learning_plans from anon, authenticated;
grant select on public.level_learning_plans to authenticated;
grant all on public.level_learning_plans to service_role;
grant usage, select on sequence public.level_learning_plans_id_seq to service_role;
create policy "level_learning_plans: own read" on public.level_learning_plans
  for select to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
create function private.capture_level_learning_plan(e public.level_enrollments, cutoff timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.level_learning_plans(user_id, level, started_at, planned_completion_date, lesson_scope, completed_lesson_ids)
  select e.user_id, e.level, e.started_at, e.planned_completion_date,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'order_index', s.order_index, 'level', e.level,
      'hasNguphapQuestions', 'nguphap' = any(s.categories),
      'hasNgheQuestions', 'nghe' = any(s.categories),
      'hasDocQuestions', 'doc' = any(s.categories)) order by s.module_order, s.order_index, s.id), '[]'::jsonb),
    coalesce(array_agg(s.id order by s.id) filter (where not exists (
      select 1 from unnest(s.categories) c where not exists (
        select 1 from public.lesson_progress p where p.user_id = e.user_id
          and p.lesson_id = s.id and p.category = c and p.quiz_score >= 80 and p.completed_at <= cutoff
      )
    )), '{}'::text[])
  from (
    select l.id, l.order_index, m.order_index as module_order, array(
      select distinct x.category from public.grammar_exercises g
        join public.exercise_sets x on x.id = g.set_id
        where g.lesson_id = l.id and x.status = 'published' and x.category in ('nguphap', 'nghe', 'doc')
      union
      select 'doc' from public.reading_question_groups g
        join public.exercise_sets x on x.id = g.set_id
        where x.lesson_id = l.id and x.status = 'published'
    ) as categories
    from public.lessons l join public.modules m on m.id = l.module_id
    where m.level = e.level and l.status = 'published'
  ) s;
end;
$$;
revoke all on function private.capture_level_learning_plan(public.level_enrollments, timestamptz) from public, anon, authenticated;

create function private.snapshot_enrollment_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if new.started_at > today or new.planned_completion_date <= new.started_at then
    raise exception 'Invalid learning plan dates' using errcode = '22023';
  end if;
  perform private.capture_level_learning_plan(new,
    case when new.started_at = today then now()
      else new.started_at::timestamp at time zone 'Asia/Ho_Chi_Minh' end);
  return new;
end;
$$;
revoke all on function private.snapshot_enrollment_plan() from public, anon, authenticated;
create trigger snapshot_enrollment_plan after insert or update of started_at, planned_completion_date
  on public.level_enrollments for each row execute function private.snapshot_enrollment_plan();

create function private.replan_extended_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if new.role = 'user' and new.subscription_end_date > today
    and (old.subscription_end_date is null or new.subscription_end_date > old.subscription_end_date) then
    if auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin'
      and coalesce(auth.jwt()->>'role','') <> 'service_role' then
      raise exception 'Only admins can replan subscriptions' using errcode = '42501';
    end if;
    insert into public.level_enrollments(user_id, level, started_at, planned_completion_date)
      select new.id, level, today, new.subscription_end_date from (select distinct unnest(new.unlocked_levels) as level) levels
      on conflict (user_id, level) do update
        set started_at = excluded.started_at, planned_completion_date = excluded.planned_completion_date;
  end if;
  return new;
end;
$$;
revoke all on function private.replan_extended_subscription() from public, anon, authenticated;
create trigger replan_extended_subscription after update of subscription_end_date on public.profiles
  for each row when (old.subscription_end_date is distinct from new.subscription_end_date)
  execute function private.replan_extended_subscription();

-- Legacy windows: reconstruct only from stored completion timestamps; never invent extension history.
do $$ declare e public.level_enrollments; begin
  for e in select * from public.level_enrollments
    where planned_completion_date > started_at and started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
  loop
    perform private.capture_level_learning_plan(e, e.started_at::timestamp at time zone 'Asia/Ho_Chi_Minh');
  end loop;
end $$;
