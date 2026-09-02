begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

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
  'ONB-01 trigger để tên user mới trống');

select is(
  (select count(*) from user_stats where user_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'ONB-02 trigger vẫn tạo user_stats');

select policies_are('public', 'profiles', array[
  'profiles: admin all',
  'profiles: own insert',
  'profiles: own read',
  'profiles: own update'
], 'ONB-03 profiles có đủ policy cần thiết');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';

select lives_ok(
  $$update profiles set full_name = '  Nguyễn Văn A  '
      where id = '33333333-3333-3333-3333-333333333333'$$,
  'ONB-04 user cập nhật profile của mình');

select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  '  Nguyễn Văn A  ',
  'ONB-05 database lưu giá trị client gửi; client chịu trách nhiệm trim');

select throws_ok(
  $$insert into profiles (id, email)
      values ('44444444-4444-4444-4444-444444444444', 'other@test.local')$$,
  '42501', null,
  'ONB-06 user không tạo profile cho id khác');

select throws_ok(
  $$update profiles set id = '44444444-4444-4444-4444-444444444444'
      where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', null,
  'ONB-07 WITH CHECK chặn đổi owner');

set local role postgres;
select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'ONB-08 anon không gọi trực tiếp handle_new_user');

select * from finish();
rollback;
