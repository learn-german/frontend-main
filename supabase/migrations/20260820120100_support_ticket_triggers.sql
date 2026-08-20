-- =============================================================================
-- DeutschPath — Support ticket: trigger giữ bất biến + RPC tạo ticket
-- =============================================================================
-- Mọi thứ client KHÔNG được phép quyết đều nằm ở đây: mã ticket, cờ is_staff,
-- chuyển trạng thái, thông báo, trần số ticket đang mở.

-- --- 1. Mã ticket do server sinh ---------------------------------------------
-- Ghi đè vô điều kiện giá trị client gửi, cùng khuôn "ghi đè im lặng" của
-- restrict_unlocked_levels_to_admin.
CREATE OR REPLACE FUNCTION support_ticket_set_code()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.code := 'SD-' || nextval('support_ticket_code_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_ticket_set_code
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION support_ticket_set_code();

-- --- 2. Trần 5 ticket đang mở mỗi người dùng ---------------------------------
-- Cùng khuôn enforce_writing_attempt_limit (cap 6 lần nộp bài viết).
-- Ticket đã resolved không tính, nên người dùng thật không bao giờ chạm trần.
CREATE OR REPLACE FUNCTION support_ticket_enforce_open_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM support_tickets
      WHERE user_id = NEW.user_id
        AND status IN ('pending', 'processing')) >= 5 THEN
    RAISE EXCEPTION 'support ticket open limit reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_ticket_open_limit
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION support_ticket_enforce_open_limit();

-- --- 3. updated_at ------------------------------------------------------------
-- Không có trigger này thì admin bấm "Bắt đầu xử lý" (UPDATE status) sẽ không
-- đổi updated_at, trong khi cả hai màn đều hiển thị hàng "Cập nhật".
CREATE OR REPLACE FUNCTION support_ticket_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_ticket_touch_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION support_ticket_touch_updated_at();

-- --- 4. Thông báo khi có ticket mới ------------------------------------------
CREATE OR REPLACE FUNCTION notify_support_ticket_created()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (for_admin, type, message)
  VALUES (true, 'support_ticket_created',
          'Có ticket hỗ trợ mới: ' || NEW.title);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_support_ticket_created
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION notify_support_ticket_created();

-- --- 5. is_staff do server quyết ---------------------------------------------
-- Bắt buộc phải ở server: nếu để client khai, học viên gửi được tin nhắn giả
-- danh support. COALESCE vì JWT không có role sẽ cho NULL, mà cột là NOT NULL.
CREATE OR REPLACE FUNCTION support_message_set_is_staff()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_staff := COALESCE(
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin', false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_message_set_is_staff
  BEFORE INSERT ON support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION support_message_set_is_staff();

-- --- 6. Chuyển trạng thái + thông báo sau mỗi tin nhắn ------------------------
-- UPDATE bên dưới kích hoạt luôn trigger 3, nên updated_at được làm mới ở cả
-- hai nhánh kể cả khi status không đổi.
CREATE OR REPLACE FUNCTION support_message_after_insert()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t support_tickets;
BEGIN
  SELECT * INTO t FROM support_tickets WHERE id = NEW.ticket_id;

  IF NEW.is_staff THEN
    UPDATE support_tickets SET status = 'resolved' WHERE id = NEW.ticket_id;

    INSERT INTO notifications (user_id, for_admin, type, message)
    VALUES (t.user_id, false, 'support_replied',
            'Ticket ' || t.code || ' đã có phản hồi từ đội ngũ hỗ trợ.');
  ELSE
    UPDATE support_tickets
       SET status = CASE WHEN status = 'resolved' THEN 'processing' ELSE status END
     WHERE id = NEW.ticket_id;

    -- Tin nhắn đầu tiên đã có thông báo support_ticket_created rồi. Không
    -- chặn ở đây thì tạo một ticket sinh ra hai thông báo cho admin về cùng
    -- một việc. Trigger là AFTER INSERT nên dòng mới đã được đếm.
    IF (SELECT count(*) FROM support_ticket_messages
         WHERE ticket_id = NEW.ticket_id) > 1 THEN
      INSERT INTO notifications (for_admin, type, message)
      VALUES (true, 'support_message',
              'Học viên vừa nhắn thêm vào ticket ' || t.code);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_message_after_insert
  AFTER INSERT ON support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION support_message_after_insert();

-- --- 7. RPC tạo ticket kèm tin nhắn đầu --------------------------------------
-- PostgREST không cho client chạy nhiều lệnh trong một transaction; insert hai
-- lượt từ client sẽ sinh ticket không có nội dung khi lượt sau hỏng.
--
-- Cố ý để SECURITY INVOKER (mặc định): hàm chạy dưới quyền người gọi nên vẫn
-- chịu đúng các policy RLS ở migration trước, không phát sinh đường phân quyền
-- mới cần soát riêng. Hàm không nhận user id — lấy auth.uid() bên trong để
-- không có đường nào truyền vào id người khác.
CREATE OR REPLACE FUNCTION create_support_ticket(
  p_title TEXT,
  p_topic TEXT,
  p_body  TEXT
)
RETURNS support_tickets
LANGUAGE plpgsql
AS $$
DECLARE
  t support_tickets;
BEGIN
  INSERT INTO support_tickets (user_id, title, topic)
  VALUES (auth.uid(), p_title, p_topic)
  RETURNING * INTO t;

  INSERT INTO support_ticket_messages (ticket_id, author_id, body)
  VALUES (t.id, auth.uid(), p_body);

  RETURN t;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_support_ticket(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION create_support_ticket(TEXT, TEXT, TEXT) TO authenticated;
