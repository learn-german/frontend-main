-- =============================================================================
-- Support ticket — trigger giữ bất biến và hàm RPC
-- Chạy: supabase test db
--
-- Các khẳng định về notifications chạy dưới quyền postgres để bỏ qua RLS: file
-- này kiểm tra trigger, còn phân quyền đã có support_rls_test.sql lo.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

-- --- Dữ liệu nền -------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'trg-a@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Học viên A"}'),
  ('00000000-0000-0000-0000-000000000000',
   '99999999-9999-9999-9999-999999999999',
   'authenticated', 'authenticated', 'trg-admin@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Admin"}');

-- --- Vai: học viên A ---------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

-- RPC tạo ticket kèm tin nhắn đầu trong một transaction
select create_support_ticket(
  'Không mở được bài nghe', 'lesson_content', 'Bài nghe Video 6 không phát được.',
  array['ticket-images/11111111-1111-1111-1111-111111111111/a.jpg']);

select matches(
  (select code from support_tickets where title = 'Không mở được bài nghe'),
  '^SD-[0-9]+$',
  'TRG-01 RPC sinh code dạng SD-<số>');

select is(
  (select count(*) from support_ticket_messages m
     join support_tickets t on t.id = m.ticket_id
    where t.title = 'Không mở được bài nghe'),
  1::bigint,
  'TRG-02 RPC tạo đúng một tin nhắn đầu');

select is(
  (select m.is_staff from support_ticket_messages m
     join support_tickets t on t.id = m.ticket_id
    where t.title = 'Không mở được bài nghe'),
  false,
  'TRG-03 tin nhắn của học viên có is_staff = false');

select is(
  (select m.image_keys[1] from support_ticket_messages m
     join support_tickets t on t.id = m.ticket_id
    where t.title = 'Không mở được bài nghe'),
  'ticket-images/11111111-1111-1111-1111-111111111111/a.jpg',
  'TRG-03a RPC lưu ảnh của tin nhắn đầu');

select is(
  (select status from support_tickets where title = 'Không mở được bài nghe'),
  'pending',
  'TRG-04 ticket mới ở trạng thái pending');

select is(
  (select count(*) from notifications where type = 'support_message'),
  0::bigint,
  'TRG-18 tạo ticket mới không sinh thêm thông báo support_message');

-- Client gửi code bịa
insert into support_tickets (code, user_id, title, topic)
values ('SD-0001', '11111111-1111-1111-1111-111111111111', 'Ticket gửi kèm code', 'other');

select isnt(
  (select code from support_tickets where title = 'Ticket gửi kèm code'),
  'SD-0001',
  'TRG-05 code do client gửi bị server ghi đè');

-- Client khai is_staff = true
insert into support_ticket_messages (ticket_id, is_staff, body)
select id, true, 'giả danh support'
  from support_tickets where title = 'Không mở được bài nghe';

select is(
  (select bool_or(is_staff) from support_ticket_messages
    where body = 'giả danh support'),
  false,
  'TRG-06 is_staff do client khai bị ép về false');

-- --- Thông báo khi tạo ticket ------------------------------------------------
set local role postgres;
select is(
  (select count(*) from notifications
    where type = 'support_ticket_created' and for_admin = true),
  2::bigint,
  'TRG-07 mỗi ticket mới sinh một thông báo broadcast cho admin');

-- --- Vai: admin tự tạo ticket (test màn học viên) ----------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}';

select create_support_ticket(
  'Admin tự mở ticket', 'other', 'Đang test luồng học viên.');

select is(
  (select m.is_staff from support_ticket_messages m
     join support_tickets t on t.id = m.ticket_id
    where t.title = 'Admin tự mở ticket'),
  false,
  'TRG-19 tin nhắn đầu của admin vẫn is_staff = false');

select is(
  (select status from support_tickets where title = 'Admin tự mở ticket'),
  'pending',
  'TRG-20 admin tạo ticket mới vẫn ở pending, không nhảy resolved');

-- --- Vai: admin trả lời ------------------------------------------------------
insert into support_ticket_messages (ticket_id, body)
select id, 'Bên mình đã cập nhật lại audio.'
  from support_tickets where title = 'Không mở được bài nghe';

select is(
  (select status from support_tickets where title = 'Không mở được bài nghe'),
  'resolved',
  'TRG-08 admin trả lời thì ticket chuyển sang resolved');
set local role postgres;
select is(
  (select count(*) from notifications
    where type = 'support_replied'
      and user_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'TRG-09 admin trả lời thì học viên nhận đúng một thông báo');

-- --- Vai: học viên nhắn tiếp vào ticket đã xử lý ------------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

insert into support_ticket_messages (ticket_id, body)
select id, 'Vẫn chưa được ạ.'
  from support_tickets where title = 'Không mở được bài nghe';

select is(
  (select status from support_tickets where title = 'Không mở được bài nghe'),
  'processing',
  'TRG-10 học viên nhắn vào ticket resolved thì ticket mở lại processing');

set local role postgres;
-- Hai tin của học viên sau tin đầu: 'giả danh support' và 'Vẫn chưa được ạ.'.
-- Tin đầu do RPC tạo cố ý không sinh thông báo này (xem TRG-18).
select is(
  (select count(*) from notifications
    where type = 'support_message' and for_admin = true),
  2::bigint,
  'TRG-11 mỗi tin nhắn tiếp theo của học viên sinh một thông báo cho admin');

-- --- Nhắn vào ticket đang pending thì giữ nguyên ------------------------------
set local role authenticated;
insert into support_ticket_messages (ticket_id, body)
select id, 'bổ sung thông tin'
  from support_tickets where title = 'Ticket gửi kèm code';

select is(
  (select status from support_tickets where title = 'Ticket gửi kèm code'),
  'pending',
  'TRG-12 nhắn vào ticket đang pending thì trạng thái giữ nguyên');

-- --- updated_at --------------------------------------------------------------
-- now() cố định trong một transaction, nên phải đẩy updated_at về quá khứ mới
-- thấy được trigger có chạy hay không. Tắt trigger để đặt được giá trị cũ.
set local role postgres;
alter table support_tickets disable trigger trg_support_ticket_touch_updated_at;
update support_tickets set updated_at = timestamptz '2020-01-01'
 where title = 'Ticket gửi kèm code';
alter table support_tickets enable trigger trg_support_ticket_touch_updated_at;

update support_tickets set status = 'processing'
 where title = 'Ticket gửi kèm code';

select ok(
  (select updated_at from support_tickets where title = 'Ticket gửi kèm code')
    > timestamptz '2020-01-02',
  'TRG-13 đổi trạng thái thì updated_at được làm mới');

alter table support_tickets disable trigger trg_support_ticket_touch_updated_at;
update support_tickets set updated_at = timestamptz '2020-01-01'
 where title = 'Ticket gửi kèm code';
alter table support_tickets enable trigger trg_support_ticket_touch_updated_at;

insert into support_ticket_messages (ticket_id, author_id, body)
select id, '11111111-1111-1111-1111-111111111111', 'thêm một tin nữa'
  from support_tickets where title = 'Ticket gửi kèm code';

select ok(
  (select updated_at from support_tickets where title = 'Ticket gửi kèm code')
    > timestamptz '2020-01-02',
  'TRG-14 có tin nhắn mới thì updated_at được làm mới');

-- --- Trần 5 ticket đang mở ---------------------------------------------------
-- Dọn sạch để phép đếm không phụ thuộc các ticket dựng ở trên.
delete from support_tickets;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

select create_support_ticket('Ticket 1', 'other', 'nội dung');
select create_support_ticket('Ticket 2', 'other', 'nội dung');
select create_support_ticket('Ticket 3', 'other', 'nội dung');
select create_support_ticket('Ticket 4', 'other', 'nội dung');
select create_support_ticket('Ticket 5', 'other', 'nội dung');

select throws_ok(
  $$select create_support_ticket('Ticket 6', 'other', 'nội dung')$$,
  '23514', null,
  'TRG-15 ticket thứ 6 đang mở bị chặn');

set local role postgres;
update support_tickets set status = 'resolved';

set local role authenticated;
select lives_ok(
  $$select create_support_ticket('Ticket sau khi đóng', 'other', 'nội dung')$$,
  'TRG-16 ticket đã resolved không tính vào trần');

-- --- Không ai ghi thẳng vào notifications ------------------------------------
select throws_ok(
  $$insert into notifications (for_admin, type, message)
    values (true, 'support_ticket_created', 'thông báo giả')$$,
  '42501', null,
  'TRG-17 không role nào insert trực tiếp vào notifications được');

set local role postgres;
select * from finish();
rollback;
