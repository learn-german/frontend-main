-- Pace clock starts when a learner becomes role user, not during trial.
alter table public.profiles add column if not exists paid_started_at date;

-- Fresh 90-day grant whose enrollment still starts before the package window
-- (studied while trial, then converted). Shift that window to the grant start.
update public.level_enrollments e
set
  planned_completion_date = case
    when e.planned_completion_date = (e.started_at + 90)
      then (p.subscription_end_date - 90) + 90
    else e.planned_completion_date
  end,
  started_at = (p.subscription_end_date - 90)
from public.profiles p
where e.user_id = p.id
  and p.role = 'user'
  and p.paid_started_at is null
  and p.subscription_end_date is not null
  and p.subscription_end_date >= current_date
  and p.subscription_end_date <= current_date + 90
  and (p.subscription_end_date - 90) <= current_date
  and e.started_at < (p.subscription_end_date - 90);

update public.profiles p
set paid_started_at = (p.subscription_end_date - 90)
where p.role = 'user'
  and p.paid_started_at is null
  and p.subscription_end_date is not null
  and p.subscription_end_date >= current_date
  and p.subscription_end_date <= current_date + 90
  and (p.subscription_end_date - 90) <= current_date
  and exists (
    select 1
    from public.level_enrollments e
    where e.user_id = p.id
      and e.started_at <= (p.subscription_end_date - 90)
  );

-- Published posts are readable without login. Drafts stay admin/tutor only.
grant select on public.posts to anon;

create policy "posts: anon read published"
  on public.posts for select to anon
  using (status = 'published');
