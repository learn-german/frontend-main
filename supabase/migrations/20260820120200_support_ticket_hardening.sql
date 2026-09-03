-- =============================================================================
-- DeutschPath — Support ticket: siết quyền + dọn cảnh báo linter
-- =============================================================================
-- Spec: docs/superpowers/specs/2026-08-20-support-ticket-design.md
-- Vá theo review vòng cuối sau khi hai migration support_tickets đã lên production.

-- --- 1. REVOKE create_support_ticket khỏi anon thực sự -----------------------
-- REVOKE ... FROM PUBLIC ở migration trước không xoá grant mà Supabase mặc định
-- cấp riêng cho role anon theo tên — PUBLIC và anon là hai grantee khác nhau.
-- Chưa khai thác được hôm nay: hàm là SECURITY INVOKER nên auth.uid() là NULL
-- với anon, và policy "own insert" yêu cầu TO authenticated nên RLS chặn đứng
-- insert. Nhưng REVOKE phải làm đúng như comment của nó đã tuyên bố.
REVOKE EXECUTE ON FUNCTION create_support_ticket(TEXT, TEXT, TEXT) FROM anon;

-- --- 2. Cố định search_path cho hai hàm bị linter gắn cờ ---------------------
-- Supabase linter báo function_search_path_mutable vì hai hàm này tạo bằng
-- CREATE FUNCTION thường (không SET search_path), khác các hàm SECURITY DEFINER
-- ở migration trigger đã có sẵn SET search_path = public trong phần khai báo.
-- Dùng ALTER FUNCTION thay vì CREATE OR REPLACE để không phải chép lại thân hàm.
--
-- support_ticket_touch_updated_at cố ý vẫn là SECURITY INVOKER — hàm chỉ gán
-- NEW.updated_at := now(), không đọc/ghi bảng nào khác nên không cần quyền
-- vượt cấp; chỉ cần khoá search_path để tránh bị đánh tráo hàm cùng tên.
ALTER FUNCTION support_ticket_touch_updated_at() SET search_path = public;
ALTER FUNCTION create_support_ticket(TEXT, TEXT, TEXT) SET search_path = public;

-- --- 3. Thông báo ticket mới kèm mã ticket ------------------------------------
-- Bản gốc chỉ gửi title, admin nhận broadcast không biết đây là ticket nào khi
-- có nhiều ticket trùng tiêu đề; thông báo support_message (mục 6, migration
-- trigger) đã kèm mã ticket, ở đây chỉnh cho nhất quán. Giữ nguyên
-- SECURITY DEFINER SET search_path = public, trigger, và type
-- 'support_ticket_created' — chỉ đổi nội dung message. Trigger là AFTER INSERT
-- nên NEW.code đã được trigger BEFORE INSERT sinh mã điền sẵn.
CREATE OR REPLACE FUNCTION notify_support_ticket_created()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (for_admin, type, message)
  VALUES (true, 'support_ticket_created',
          'Có ticket hỗ trợ mới ' || NEW.code || ': ' || NEW.title);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
