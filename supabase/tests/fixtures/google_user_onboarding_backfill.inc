-- Backfill đúng một lần: chỉ các profile chưa có tên.
update public.profiles as p
set full_name = coalesce(
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'email'), ''),
  nullif(btrim(u.email), '')
)
from auth.users as u
where u.id = p.id
  and nullif(btrim(p.full_name), '') is null;
