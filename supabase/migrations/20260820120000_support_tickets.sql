-- =============================================================================
-- DeutschPath — Support ticket: bảng, ràng buộc, RLS
-- =============================================================================
-- Spec: docs/superpowers/specs/2026-08-20-support-ticket-design.md
--
-- Ticket không chứa dữ liệu cần giấu client (khác correct_answer của quiz), nên
-- RLS là lớp phân quyền duy nhất — không có Edge Function nào đứng trước.

-- Mã hiển thị cho người dùng (SD-1000, SD-1001, ...) thay vì phơi UUID.
CREATE SEQUENCE support_ticket_code_seq START 1000;

-- user_id trỏ profiles(id) chứ không phải auth.users(id) để màn admin
-- nested-select profiles(email, full_name) trong đúng một query — cùng lý do đã
-- ghi trong migration writing_submissions.
CREATE TABLE support_tickets (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  topic      TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check
    CHECK (status IN ('pending', 'processing', 'resolved')),
  CONSTRAINT support_tickets_topic_check
    CHECK (topic IN ('website_issue', 'lesson_content', 'exercise_feedback',
                     'account_access', 'other'))
);

-- code KHÔNG có DEFAULT: DEFAULT chỉ áp dụng khi client bỏ trống cột, mà
-- PostgREST cho client gửi thẳng code tuỳ ý. Trigger ở migration kế tiếp sinh
-- giá trị này và luôn ghi đè.

CREATE INDEX support_tickets_user_created_idx
  ON support_tickets (user_id, created_at DESC);

CREATE TABLE support_ticket_messages (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id  UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- DEFAULT auth.uid(): client không cần gửi author_id, nên không có đường nào
  -- gửi sai. Policy WITH CHECK bên dưới vẫn chặn nếu ai đó cố gửi id người khác.
  author_id  UUID        NOT NULL DEFAULT auth.uid()
                         REFERENCES profiles(id) ON DELETE CASCADE,
  is_staff   BOOLEAN     NOT NULL DEFAULT false,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_created_idx
  ON support_ticket_messages (ticket_id, created_at);

ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- --- support_tickets ---------------------------------------------------------

CREATE POLICY "support_tickets: own read"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Học viên chỉ tạo được ticket của chính mình và luôn ở trạng thái pending.
CREATE POLICY "support_tickets: own insert"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Cố ý KHÔNG có policy UPDATE cho học viên: trạng thái chỉ đổi bởi admin hoặc
-- bởi trigger (chạy SECURITY DEFINER nên bỏ qua RLS). Không có policy DELETE
-- cho học viên: ticket đã gửi không tự xoá được.

CREATE POLICY "support_tickets: admin all"
  ON support_tickets FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --- support_ticket_messages -------------------------------------------------

-- EXISTS bên dưới tự chịu RLS của support_tickets: học viên chỉ thấy được ticket
-- của mình nên chỉ đọc được tin nhắn trong đó.
CREATE POLICY "support_ticket_messages: own read"
  ON support_ticket_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "support_ticket_messages: own insert"
  ON support_ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
    )
  );

-- Không có UPDATE/DELETE cho học viên: tin nhắn đã gửi không sửa/xoá được.

CREATE POLICY "support_ticket_messages: admin all"
  ON support_ticket_messages FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
