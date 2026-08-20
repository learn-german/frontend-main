-- =============================================================================
-- Support ticket — cấu trúc bảng và ràng buộc
-- Chạy: supabase test db
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- --- Cấu trúc ---------------------------------------------------------------
select has_table('public', 'support_tickets',
  'DB-01 bảng support_tickets tồn tại');
select has_table('public', 'support_ticket_messages',
  'DB-02 bảng support_ticket_messages tồn tại');
select has_sequence('public', 'support_ticket_code_seq',
  'DB-03 sequence sinh mã ticket tồn tại');
select has_function('public', 'create_support_ticket',
  array['text', 'text', 'text'],
  'DB-04 hàm RPC create_support_ticket tồn tại');

select is(
  (select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass),
  true, 'DB-05 RLS được bật trên support_tickets');
select is(
  (select relrowsecurity from pg_class where oid = 'public.support_ticket_messages'::regclass),
  true, 'DB-06 RLS được bật trên support_ticket_messages');

-- --- Dữ liệu nền -------------------------------------------------------------
-- Trigger on_auth_user_created tự tạo row profiles tương ứng.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'schema-a@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Schema A"}');

-- --- Ràng buộc CHECK ---------------------------------------------------------
select throws_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'chu_de_bia')$$,
  '23514', null,
  'DB-07 topic ngoài 5 giá trị hợp lệ bị chặn');

select throws_ok(
  $$insert into support_tickets (user_id, title, topic, status)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'other', 'archived')$$,
  '23514', null,
  'DB-08 status ngoài 3 giá trị hợp lệ bị chặn');

select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'website_issue')$$,
  'DB-09 topic website_issue được chấp nhận');
select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'lesson_content')$$,
  'DB-10 topic lesson_content được chấp nhận');
select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'exercise_feedback')$$,
  'DB-11 topic exercise_feedback được chấp nhận');
select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'account_access')$$,
  'DB-12 topic account_access được chấp nhận');
select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'other')$$,
  'DB-13 topic other được chấp nhận');

-- --- Mã ticket ---------------------------------------------------------------
select matches(
  (select code from support_tickets order by created_at limit 1),
  '^SD-[0-9]+$',
  'DB-14 code có dạng SD-<số>');

-- --- Xoá ticket kéo theo tin nhắn --------------------------------------------
with t as (
  insert into support_tickets (user_id, title, topic)
  values ('11111111-1111-1111-1111-111111111111', 'ticket sẽ xoá', 'other')
  returning id
)
insert into support_ticket_messages (ticket_id, author_id, body)
select id, '11111111-1111-1111-1111-111111111111', 'nội dung' from t;

delete from support_tickets where title = 'ticket sẽ xoá';

select is(
  (select count(*) from support_ticket_messages where body = 'nội dung'),
  0::bigint,
  'DB-15 xoá ticket thì tin nhắn trong ticket đó bị xoá theo');

select * from finish();
rollback;
