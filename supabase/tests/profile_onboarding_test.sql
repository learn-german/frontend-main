begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Các fixture này mô phỏng profile cũ: trigger hiện tại tạo profile trống,
-- sau đó chỉ statement backfill được chạy lại trong cùng transaction.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'full-name-auth@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"  Tên Ưu Tiên  ","name":"Tên Không Được Chọn","email":"metadata-full@test.local"}'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'name-auth@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"   ","name":"  Tên Dự Phòng  ","email":"metadata-name@test.local"}'),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'auth-email@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":" ","name":" ","email":"  metadata-email@test.local  "}'),
  ('00000000-0000-0000-0000-000000000000',
   '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'auth-fallback@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{}'),
  ('00000000-0000-0000-0000-000000000000',
   '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'preserved-auth@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Metadata Không Được Ghi Đè"}'),
  ('00000000-0000-0000-0000-000000000000',
   '88888888-8888-8888-8888-888888888888',
   'authenticated', 'authenticated', '  padded-auth@test.local  ', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":" ","name":"  ","email":"   "}');

update public.profiles
set email = case id
  when '55555555-5555-5555-5555-555555555555' then 'profile-email@test.local'
  when '66666666-6666-6666-6666-666666666666' then 'profile-fallback@test.local'
  when '77777777-7777-7777-7777-777777777777' then 'preserved-profile@test.local'
  when '88888888-8888-8888-8888-888888888888' then 'profile-padded@test.local'
  else email
end,
full_name = case id
  when '11111111-1111-1111-1111-111111111111' then '   '
  when '77777777-7777-7777-7777-777777777777' then 'Tên Đã Có'
  else full_name
end
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777',
  '88888888-8888-8888-8888-888888888888'
);

-- Supabase pg-prove chỉ mount supabase/tests. File .inc này nằm trong mount
-- nhưng không bị pg-prove thu thập như một test .sql độc lập. Node test
-- src/lib/profileOnboardingMigration.test.ts buộc nội dung này khớp migration.
\ir fixtures/google_user_onboarding_backfill.inc

select is(
  (select full_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Tên Ưu Tiên',
  'ONB-01 backfill trim full_name và ưu tiên nó');

select is(
  (select full_name from profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Tên Dự Phòng',
  'ONB-02 backfill trim name khi full_name trống');

select is(
  (select full_name from profiles where id = '55555555-5555-5555-5555-555555555555'),
  'metadata-email@test.local',
  'ONB-03 backfill trim email metadata trước profile email');

select is(
  (select full_name from profiles where id = '66666666-6666-6666-6666-666666666666'),
  'auth-fallback@test.local',
  'ONB-04 backfill dùng auth email khi metadata email vắng');

select is(
  (select full_name from profiles where id = '77777777-7777-7777-7777-777777777777'),
  'Tên Đã Có',
  'ONB-05 backfill không ghi đè tên profile không rỗng');

select is(
  (select full_name from profiles where id = '88888888-8888-8888-8888-888888888888'),
  'padded-auth@test.local',
  'ONB-06 backfill bỏ metadata email trắng và trim auth email');

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'new-google@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Google Name","name":"Fallback Name"}');

select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  null::text,
  'ONB-07 trigger để tên user mới trống');

select is(
  (select count(*) from user_stats where user_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'ONB-08 trigger vẫn tạo user_stats');

select policies_are('public', 'profiles', array[
  'profiles: admin update',
  'profiles: own insert',
  'profiles: own read',
  'profiles: own update'
], 'ONB-09 profiles có đủ policy cần thiết');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';

select lives_ok(
  $$update profiles set full_name = '  Nguyễn Văn A  '
      where id = '33333333-3333-3333-3333-333333333333'$$,
  'ONB-10 user cập nhật profile của mình');

select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  '  Nguyễn Văn A  ',
  'ONB-11 database lưu giá trị client gửi; client chịu trách nhiệm trim');

select throws_ok(
  $$insert into profiles (id, email)
      values ('44444444-4444-4444-4444-444444444444', 'other@test.local')$$,
  '42501', null,
  'ONB-12 user không tạo profile cho id khác');

select throws_ok(
  $$update profiles set id = '44444444-4444-4444-4444-444444444444'
      where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', null,
  'ONB-13 WITH CHECK chặn đổi owner');

set local role postgres;
select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'ONB-14 anon không gọi trực tiếp handle_new_user');

select * from finish();
rollback;
