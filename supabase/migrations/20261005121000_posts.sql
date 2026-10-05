-- Blog posts (CMS tối giản): học viên đọc bài đã publish, admin/tutor CRUD.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body_md text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts: authenticated read published"
  on public.posts for select to authenticated
  using (status = 'published');

-- public.is_jwt_admin_or_tutor() định nghĩa ở 20260912230000_tutor_role_rls.sql
create policy "posts: admin or tutor all"
  on public.posts for all to authenticated
  using (public.is_jwt_admin_or_tutor())
  with check (public.is_jwt_admin_or_tutor());
