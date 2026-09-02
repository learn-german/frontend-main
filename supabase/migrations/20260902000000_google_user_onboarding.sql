-- Backfill đúng một lần: chỉ các profile chưa có tên.
update public.profiles as p
set full_name = coalesce(
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
  p.email
)
from auth.users as u
where u.id = p.id
  and nullif(btrim(p.full_name), '') is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, null);

  insert into public.user_stats (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

drop policy if exists "profiles: own insert" on public.profiles;
create policy "profiles: own insert"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
