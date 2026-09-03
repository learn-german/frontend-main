-- =============================================================================
-- Support ticket — phân quyền RLS
-- Chạy: supabase test db
--
-- Đổi vai bằng `set local role` + `set local "request.jwt.claims"`: cả hai đều
-- là lệnh SET nên không sinh dòng kết quả nào làm nhiễu output TAP.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- --- Dữ liệu nền -------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'rls-a@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Học viên A"}'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'rls-b@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Học viên B"}'),
  ('00000000-0000-0000-0000-000000000000',
   '99999999-9999-9999-9999-999999999999',
   'authenticated', 'authenticated', 'rls-admin@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Admin"}');

-- Ticket của A kèm một tin nhắn, tạo bằng quyền postgres nên bỏ qua RLS.
insert into support_tickets (id, user_id, title, topic)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Ticket của A', 'lesson_content');

insert into support_ticket_messages (ticket_id, author_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Nội dung của A');

-- --- Bộ policy đúng như thiết kế ---------------------------------------------
select policies_are('public', 'support_tickets', array[
  'support_tickets: own read',
  'support_tickets: own insert',
  'support_tickets: admin all'
], 'RLS-01 support_tickets có đúng 3 policy, không thừa policy UPDATE/DELETE cho học viên');

select policies_are('public', 'support_ticket_messages', array[
  'support_ticket_messages: own read',
  'support_ticket_messages: own insert',
  'support_ticket_messages: admin all'
], 'RLS-02 support_ticket_messages có đúng 3 policy');

-- --- Vai: học viên A ---------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

select is((select count(*) from support_tickets), 1::bigint,
  'RLS-03 A đọc được ticket của chính mình');

update support_tickets set status = 'resolved'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select status from support_tickets where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'pending',
  'RLS-04 A không đổi được trạng thái ticket (không có policy UPDATE)');

delete from support_tickets where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select count(*) from support_tickets), 1::bigint,
  'RLS-05 A không xoá được ticket (không có policy DELETE)');

select throws_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('22222222-2222-2222-2222-222222222222', 'ticket hộ B', 'other')$$,
  '42501', null,
  'RLS-06 A không tạo được ticket đứng tên B');

select throws_ok(
  $$insert into support_tickets (user_id, title, topic, status)
    values ('11111111-1111-1111-1111-111111111111', 'tự đánh dấu xong', 'other', 'resolved')$$,
  '42501', null,
  'RLS-07 A không tạo được ticket với trạng thái khác pending');

select lives_ok(
  $$insert into support_tickets (user_id, title, topic)
    values ('11111111-1111-1111-1111-111111111111', 'ticket hợp lệ của A', 'other')$$,
  'RLS-08 A tạo được ticket của chính mình');

select is((select count(*) from support_ticket_messages), 1::bigint,
  'RLS-09 A đọc được tin nhắn trong ticket của mình');

-- --- Vai: học viên B ---------------------------------------------------------
set local "request.jwt.claims" =
  '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"user"}}';

select is((select count(*) from support_tickets), 0::bigint,
  'RLS-10 B không đọc được ticket của A');

select is((select count(*) from support_ticket_messages), 0::bigint,
  'RLS-11 B không đọc được tin nhắn trong ticket của A');

select throws_ok(
  $$insert into support_ticket_messages (ticket_id, body)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'chen vao ticket nguoi khac')$$,
  '42501', null,
  'RLS-12 B không gửi được tin nhắn vào ticket của A');

-- --- Vai: học viên A giả mạo tác giả ----------------------------------------
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

select throws_ok(
  $$insert into support_ticket_messages (ticket_id, author_id, body)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '22222222-2222-2222-2222-222222222222', 'mao danh B')$$,
  '42501', null,
  'RLS-13 A không gán được tin nhắn đứng tên B');

-- --- Vai: admin --------------------------------------------------------------
set local "request.jwt.claims" =
  '{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';

update support_tickets set status = 'processing'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select status from support_tickets where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'processing',
  'RLS-14 admin đọc và đổi được trạng thái mọi ticket');

set local role postgres;
select * from finish();
rollback;
