# Support Ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học viên gửi được yêu cầu hỗ trợ và trao đổi nhiều lượt với đội ngũ; admin tiếp nhận, trả lời và đổi trạng thái — thay cho `ComingSoonPage` đang chiếm route `/help`.

**Architecture:** Hai bảng Postgres (`support_tickets`, `support_ticket_messages`) với RLS làm lớp phân quyền duy nhất, trigger `SECURITY DEFINER` giữ các bất biến mà client không được phép quyết (mã ticket, cờ `is_staff`, chuyển trạng thái, thông báo), và một hàm RPC `create_support_ticket` để tạo ticket cùng tin nhắn đầu trong một transaction. Không thêm Edge Function. Frontend gọi PostgREST qua một lớp `src/lib/support.ts` dùng chung cho cả hai màn.

**Tech Stack:** Postgres 15 (Supabase), PostgREST, React 19 + TypeScript 5.8, Tailwind CSS v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-20-support-ticket-design.md`

## Global Constraints

Copy nguyên văn từ spec và CLAUDE.md — mọi task đều chịu các ràng buộc này:

- Ngôn ngữ code (tên biến, hàm, type, comment kỹ thuật): **English**. Nội dung hiển thị cho user: **Tiếng Việt**.
- Không dùng `any`. Dùng type cụ thể hoặc `unknown`.
- Export named exports, không default export.
- Không dùng `window.alert()` / `window.confirm()` — dùng `showToast()` từ `src/lib/toast.ts`.
- Dùng component có sẵn trong `src/components/DesignSystem.tsx` (`Button`) trước khi tạo mới.
- **Không sửa tay** `src/lib/database.types.ts` — chỉ sinh bằng `npm run gen:types`.
- Mọi bảng phải bật RLS. Không tắt RLS trên bất kỳ bảng nào.
- `SUPABASE_SERVICE_ROLE_KEY` không xuất hiện ở bất kỳ đâu trong frontend/admin.
- Năm giá trị `topic` hợp lệ, đúng chuỗi này: `website_issue`, `lesson_content`, `exercise_feedback`, `account_access`, `other`.
- Ba giá trị `status` hợp lệ, đúng chuỗi này: `pending`, `processing`, `resolved`.
- Ba giá trị `notifications.type` mới, đúng chuỗi này: `support_ticket_created`, `support_message`, `support_replied`.
- Trần 5 ticket đang mở (`pending` + `processing`) mỗi người dùng.
- `PAGE_SIZE = 15` cho danh sách admin.

## Điều kiện tiên quyết — đọc trước khi bắt đầu

**Task 1, 2, 3 cần Supabase local chạy được, tức là cần Docker daemon.** Tại thời điểm viết kế hoạch này, máy chưa chạy được: `docker` không có trên PATH và `supabase status` báo `Cannot connect to the Docker daemon`.

Kiểm tra trước khi vào Task 1:

```bash
supabase status
```

Nếu lệnh trên báo lỗi Docker: mở Docker Desktop (hoặc OrbStack) rồi chạy `supabase start`. Không có nó thì **không thể** chạy `supabase db reset` lẫn `npm run gen:types` (script này dùng `supabase gen types typescript --local`). Đừng lách bằng cách sửa tay `database.types.ts` — CLAUDE.md cấm.

`psql` cũng không có trên PATH. Hai cách chạy file SQL kiểm chứng, chọn một:

- **Cách A (không cài gì):** mở Supabase Studio ở http://127.0.0.1:54323, dán nội dung file `.sql` vào SQL Editor rồi chạy.
- **Cách B (cài psql):** `brew install libpq && brew link --force libpq`, sau đó dùng lệnh đã ghi trong từng task.

Các file kiểm chứng `.sql` viết trong kế hoạch này là **file tạm**, để trong thư mục scratch, **không commit**.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/20260820120000_support_tickets.sql` | Tạo bảng, sequence, index, ràng buộc CHECK, bật RLS và toàn bộ policy. Không chứa logic. |
| `supabase/migrations/20260820120100_support_ticket_triggers.sql` | Toàn bộ trigger giữ bất biến + hàm RPC `create_support_ticket`. Tách khỏi file trên để người review duyệt mô hình dữ liệu và logic riêng. |
| `src/lib/appTypes.ts` | (sửa) Thêm type và nhãn tiếng Việt cho ticket. Chỉ khai báo, không có lời gọi mạng. |
| `src/lib/support.ts` | (mới) Lớp truy cập dữ liệu duy nhất cho support: cột select, hàm map snake_case → camelCase, và sáu hàm query/mutation. Cả hai màn dùng chung, không màn nào tự gọi `supabase.from("support_tickets")`. |
| `src/pages/SupportPage.tsx` | (mới) Màn học viên. Chỉ UI + state, mọi truy cập dữ liệu qua `src/lib/support.ts`. |
| `src/pages/admin/AdminSupportSection.tsx` | (mới) Màn admin. Tương tự, chỉ UI + state. |
| `src/components/Navigation.tsx` | (sửa) Nới union `onNavigate` về `AppPage`, bỏ `as any`. |
| `src/App.tsx` | (sửa) Render `SupportPage` thay `ComingSoonPage`; thêm nhánh `support_replied` vào `handleNotificationNavigate`. |
| `src/pages/admin/AdminPage.tsx` | (sửa) Thêm `"support"` vào `AdminSection` và `NAV_ITEMS`, render section mới. |
| `src/pages/admin/AdminApp.tsx` | (sửa) Thêm nhánh `support_*` vào `handleNotificationNavigate`. |
| `src/lib/database.types.ts` | (sinh lại) Bằng `npm run gen:types`. |

Lý do tách `src/lib/support.ts`: hai màn cùng cần map dữ liệu và cùng phải tuân quy tắc "ghi xong phải tải lại". Để logic đó ở một chỗ thì quy tắc chỉ cần đúng một lần, và hai file page giữ được kích thước đọc hết trong một lần nhìn.

---

## Task 1: Migration — bảng, ràng buộc, RLS

**Files:**
- Create: `supabase/migrations/20260820120000_support_tickets.sql`
- Test (tạm, không commit): `<scratch>/probe_rls.sql`

**Interfaces:**
- Consumes: bảng `profiles` (có sẵn), trigger `on_auth_user_created` (có sẵn).
- Produces: bảng `support_tickets(id, code, user_id, title, topic, status, created_at, updated_at)`, bảng `support_ticket_messages(id, ticket_id, author_id, is_staff, body, created_at)`, sequence `support_ticket_code_seq`. Task 2 gắn trigger lên đúng hai bảng này.

- [ ] **Step 1: Xác nhận Supabase local chạy được**

```bash
supabase status
```

Kỳ vọng: in ra danh sách service kèm URL. Nếu báo lỗi Docker, dừng lại và xử lý theo mục "Điều kiện tiên quyết" ở trên.

- [ ] **Step 2: Viết migration**

Tạo `supabase/migrations/20260820120000_support_tickets.sql`:

```sql
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
  author_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
```

- [ ] **Step 3: Áp migration**

```bash
supabase db reset
```

Kỳ vọng: chạy hết migrations rồi tới `seed.sql`, không lỗi. Nếu báo lỗi cú pháp SQL, sửa file rồi chạy lại.

- [ ] **Step 4: Viết file kiểm chứng RLS**

Tạo `<scratch>/probe_rls.sql`. File này tự dựng hai học viên và một admin, rồi khẳng định bằng `RAISE EXCEPTION` — chạy im lặng là đạt, có dòng nào sai là văng lỗi ngay.

```sql
BEGIN;

-- Ba tài khoản. INSERT vào auth.users kích hoạt trigger on_auth_user_created,
-- trigger đó tự tạo row profiles + user_stats tương ứng.
INSERT INTO auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'probe-a@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Probe A"}'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'probe-b@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Probe B"}');

-- Ticket của A, tạo bằng quyền postgres nên bỏ qua RLS.
-- code phải điền tay vì trigger sinh code chưa tồn tại ở Task 1.
INSERT INTO support_tickets (code, user_id, title, topic)
VALUES ('SD-PROBE', '11111111-1111-1111-1111-111111111111',
        'Ticket của A', 'lesson_content');

-- --- A đọc được ticket của mình ---
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

DO $$
BEGIN
  IF (SELECT count(*) FROM support_tickets) <> 1 THEN
    RAISE EXCEPTION 'FAIL: A phải đọc được đúng 1 ticket của mình';
  END IF;
END $$;

-- --- A không đổi được trạng thái (không có policy UPDATE) ---
DO $$
DECLARE
  affected INT;
BEGIN
  UPDATE support_tickets SET status = 'resolved' WHERE code = 'SD-PROBE';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: học viên không được phép đổi trạng thái ticket';
  END IF;
END $$;

-- --- B không đọc được ticket của A ---
SET LOCAL "request.jwt.claims" =
  '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"user"}}';

DO $$
BEGIN
  IF (SELECT count(*) FROM support_tickets) <> 0 THEN
    RAISE EXCEPTION 'FAIL: B không được đọc ticket của A';
  END IF;
END $$;

-- --- admin đọc được tất cả ---
SET LOCAL "request.jwt.claims" =
  '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"role":"admin"}}';

DO $$
BEGIN
  IF (SELECT count(*) FROM support_tickets) <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin phải đọc được mọi ticket';
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 5: Chạy kiểm chứng**

Cách B (có psql):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f <scratch>/probe_rls.sql
```

Cách A: dán toàn bộ file vào SQL Editor của Studio (http://127.0.0.1:54323) rồi chạy.

Kỳ vọng: **không có dòng `FAIL:` nào**, kết thúc bằng `ROLLBACK`. Nếu thấy `FAIL:` thì đọc thông điệp, sửa policy tương ứng trong migration, chạy lại `supabase db reset`, rồi chạy lại probe.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260820120000_support_tickets.sql
git commit -m "feat(support): bảng ticket + RLS

Học viên chỉ đọc/tạo ticket của mình và không có policy UPDATE nào —
trạng thái chỉ đổi bởi admin hoặc trigger. code để NOT NULL không DEFAULT
vì trigger ở migration sau sẽ sinh và luôn ghi đè."
```

---

## Task 2: Migration — trigger giữ bất biến + hàm RPC

**Files:**
- Create: `supabase/migrations/20260820120100_support_ticket_triggers.sql`
- Test (tạm, không commit): `<scratch>/probe_triggers.sql`

**Interfaces:**
- Consumes: hai bảng và sequence từ Task 1; bảng `notifications` (có sẵn).
- Produces: hàm RPC `create_support_ticket(p_title TEXT, p_topic TEXT, p_body TEXT) RETURNS support_tickets` — Task 3 gọi hàm này qua `supabase.rpc("create_support_ticket", { p_title, p_topic, p_body })`. Ba giá trị `notifications.type` mới: `support_ticket_created`, `support_message`, `support_replied` — Task 7 bắt đúng ba chuỗi này.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/20260820120100_support_ticket_triggers.sql`:

```sql
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

    INSERT INTO notifications (for_admin, type, message)
    VALUES (true, 'support_message',
            'Học viên vừa nhắn thêm vào ticket ' || t.code);
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
```

- [ ] **Step 2: Áp migration**

```bash
supabase db reset
```

Kỳ vọng: chạy hết, không lỗi.

- [ ] **Step 3: Viết file kiểm chứng trigger**

Tạo `<scratch>/probe_triggers.sql`:

```sql
BEGIN;

INSERT INTO auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'probe-a@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Probe A"}'),
  ('00000000-0000-0000-0000-000000000000',
   '99999999-9999-9999-9999-999999999999',
   'authenticated', 'authenticated', 'probe-admin@test.local', 'x',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Probe Admin"}');

SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}';

-- --- RPC tạo cả ticket lẫn tin nhắn đầu, code do server sinh ---
DO $$
DECLARE
  t support_tickets;
BEGIN
  t := create_support_ticket('Không mở được bài nghe', 'lesson_content',
                             'Bài nghe Video 6 không phát được.');

  IF t.code !~ '^SD-[0-9]+$' THEN
    RAISE EXCEPTION 'FAIL: code phải do server sinh dạng SD-<số>, nhận được %', t.code;
  END IF;
  IF t.status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: ticket mới phải ở pending, nhận được %', t.status;
  END IF;
  IF (SELECT count(*) FROM support_ticket_messages WHERE ticket_id = t.id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: RPC phải tạo đúng 1 tin nhắn đầu';
  END IF;
  IF (SELECT is_staff FROM support_ticket_messages WHERE ticket_id = t.id) THEN
    RAISE EXCEPTION 'FAIL: tin nhắn của học viên phải có is_staff = false';
  END IF;
END $$;

-- --- Học viên khai is_staff = true vẫn bị ép về false ---
DO $$
DECLARE
  v_ticket UUID;
BEGIN
  SELECT id INTO v_ticket FROM support_tickets LIMIT 1;

  INSERT INTO support_ticket_messages (ticket_id, author_id, is_staff, body)
  VALUES (v_ticket, '11111111-1111-1111-1111-111111111111', true, 'giả danh');

  IF (SELECT bool_or(is_staff) FROM support_ticket_messages
      WHERE ticket_id = v_ticket) THEN
    RAISE EXCEPTION 'FAIL: is_staff do client khai phải bị ép về false';
  END IF;
END $$;

-- --- Học viên gửi code bịa vẫn bị ghi đè ---
DO $$
DECLARE
  v_code TEXT;
BEGIN
  INSERT INTO support_tickets (code, user_id, title, topic)
  VALUES ('SD-0001', '11111111-1111-1111-1111-111111111111',
          'Ticket bịa code', 'other')
  RETURNING code INTO v_code;

  IF v_code = 'SD-0001' THEN
    RAISE EXCEPTION 'FAIL: code client gửi phải bị ghi đè';
  END IF;
END $$;

-- --- Admin trả lời: ticket thành resolved, học viên nhận thông báo ---
DO $$
DECLARE
  v_ticket UUID;
  v_owner  UUID;
BEGIN
  SELECT id, user_id INTO v_ticket, v_owner
    FROM support_tickets ORDER BY created_at LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"role":"admin"}}',
    true);

  INSERT INTO support_ticket_messages (ticket_id, author_id, body)
  VALUES (v_ticket, '99999999-9999-9999-9999-999999999999', 'Đã sửa nhé.');

  IF (SELECT status FROM support_tickets WHERE id = v_ticket) <> 'resolved' THEN
    RAISE EXCEPTION 'FAIL: admin trả lời thì ticket phải thành resolved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM notifications
                 WHERE type = 'support_replied' AND user_id = v_owner) THEN
    RAISE EXCEPTION 'FAIL: phải có notification support_replied cho học viên';
  END IF;
END $$;

-- --- Học viên nhắn tiếp: ticket mở lại processing ---
DO $$
DECLARE
  v_ticket UUID;
BEGIN
  SELECT id INTO v_ticket FROM support_tickets ORDER BY created_at LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}',
    true);

  INSERT INTO support_ticket_messages (ticket_id, author_id, body)
  VALUES (v_ticket, '11111111-1111-1111-1111-111111111111', 'Vẫn chưa được ạ.');

  IF (SELECT status FROM support_tickets WHERE id = v_ticket) <> 'processing' THEN
    RAISE EXCEPTION 'FAIL: học viên nhắn vào ticket resolved thì phải mở lại processing';
  END IF;
END $$;

-- --- Trần 5 ticket đang mở ---
DO $$
DECLARE
  i INT;
  blocked BOOLEAN := false;
BEGIN
  FOR i IN 1..10 LOOP
    BEGIN
      PERFORM create_support_ticket('Ticket ' || i, 'other', 'nội dung');
    EXCEPTION WHEN check_violation THEN
      blocked := true;
      EXIT;
    END;
  END LOOP;

  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL: phải bị chặn khi vượt 5 ticket đang mở';
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 4: Chạy kiểm chứng**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f <scratch>/probe_triggers.sql
```

Kỳ vọng: không có `FAIL:` nào. Mỗi thông điệp `FAIL:` nói thẳng bất biến nào vỡ — sửa đúng hàm đó trong migration, `supabase db reset`, chạy lại.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820120100_support_ticket_triggers.sql
git commit -m "feat(support): trigger giữ bất biến + RPC create_support_ticket

Mã ticket, is_staff, chuyển trạng thái và thông báo đều do server quyết.
RPC để SECURITY INVOKER nên vẫn chịu RLS, và không nhận user id — lấy
auth.uid() bên trong."
```

---

## Task 3: Type và lớp truy cập dữ liệu

**Files:**
- Modify: `src/lib/appTypes.ts` (thêm vào cuối file)
- Create: `src/lib/support.ts`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: RPC `create_support_ticket` và hai bảng từ Task 1–2.
- Produces: type `SupportTicket`, `SupportTicketMessage`, `SupportTicketStatus`, `SupportTicketTopic`; hằng `SUPPORT_TOPIC_LABELS`, `SUPPORT_STATUS_LABELS`; sáu hàm trong `src/lib/support.ts`: `listMyTickets()`, `listAllTickets()`, `listMessages(ticketId)`, `createTicket(title, topic, body)`, `sendMessage(ticketId, body)`, `updateTicketStatus(ticketId, status)`. Task 5 và 6 chỉ dùng đúng các tên này.

- [ ] **Step 1: Sinh lại database types**

```bash
npm run gen:types
```

Kỳ vọng: `src/lib/database.types.ts` đổi, xuất hiện `support_tickets`, `support_ticket_messages`, `create_support_ticket`. Nếu lệnh lỗi vì Supabase local chưa chạy, quay lại mục "Điều kiện tiên quyết" — **không sửa tay file này**.

- [ ] **Step 2: Thêm type vào `src/lib/appTypes.ts`**

Thêm vào cuối file:

```ts
export type SupportTicketStatus = "pending" | "processing" | "resolved";

export type SupportTicketTopic =
  | "website_issue"
  | "lesson_content"
  | "exercise_feedback"
  | "account_access"
  | "other";

/** Khoá tiếng Anh lưu trong DB, nhãn tiếng Việt chỉ dùng để hiển thị. */
export const SUPPORT_TOPIC_LABELS: Record<SupportTicketTopic, string> = {
  website_issue: "Lỗi hoặc sự cố trên website",
  lesson_content: "Nội dung bài học / bài tập",
  exercise_feedback: "Đóng góp ý kiến cho phần bài tập",
  account_access: "Tài khoản hoặc quyền truy cập",
  other: "Khác",
};

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  pending: "Đang chờ xử lý",
  processing: "Đang xử lý",
  resolved: "Đã xử lý",
};

export interface SupportTicket {
  id: string;
  code: string;
  userId: string;
  title: string;
  topic: SupportTicketTopic;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  /** Chỉ màn admin mới nhúng; màn học viên luôn là null. */
  author: { email: string; fullName: string | null } | null;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
}
```

- [ ] **Step 3: Viết `src/lib/support.ts`**

```ts
import { supabase } from "./supabase";
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketTopic,
} from "./appTypes";

const TICKET_COLUMNS = "id, code, user_id, title, topic, status, created_at, updated_at";
const MESSAGE_COLUMNS = "id, ticket_id, author_id, is_staff, body, created_at";

/**
 * Nhúng thường (không !inner) và kiểu nullable, đúng như AdminWritingSection
 * đang làm: một ticket thiếu profile vẫn phải hiện ra thay vì biến mất.
 */
const ADMIN_TICKET_COLUMNS = `${TICKET_COLUMNS}, profiles(email, full_name)`;

interface TicketRow {
  id: string;
  code: string;
  user_id: string;
  title: string;
  topic: string;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  author_id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
}

function mapTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    title: row.title,
    topic: row.topic as SupportTicketTopic,
    status: row.status as SupportTicketStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.profiles
      ? { email: row.profiles.email, fullName: row.profiles.full_name }
      : null,
  };
}

function mapMessage(row: MessageRow): SupportTicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    isStaff: row.is_staff,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Ticket của chính người đang đăng nhập — RLS lo phần lọc. */
export async function listMyTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapTicket(row as TicketRow));
}

/** Toàn bộ ticket kèm thông tin học viên — chỉ admin gọi được (RLS chặn). */
export async function listAllTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(ADMIN_TICKET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapTicket(row as TicketRow));
}

export async function listMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select(MESSAGE_COLUMNS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMessage(row as MessageRow));
}

/**
 * Tạo ticket kèm tin nhắn đầu trong một transaction. Ném lỗi khi vượt trần 5
 * ticket đang mở — người gọi bắt và hiện thông báo cho người dùng.
 */
export async function createTicket(
  title: string,
  topic: SupportTicketTopic,
  body: string,
): Promise<SupportTicket> {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_title: title,
    p_topic: topic,
    p_body: body,
  });
  if (error) throw error;
  return mapTicket(data as unknown as TicketRow);
}

export async function sendMessage(ticketId: string, body: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Chưa đăng nhập");

  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    author_id: auth.user.id,
    body,
  });
  if (error) throw error;
}

/** Chỉ admin gọi được — RLS chặn học viên. */
export async function updateTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<void> {
  const { error } = await supabase
    .from("support_tickets")
    .update({ status })
    .eq("id", ticketId);
  if (error) throw error;
}
```

- [ ] **Step 4: Kiểm tra type**

```bash
npm run lint
```

Kỳ vọng: không lỗi. Lỗi hay gặp: `database.types.ts` chưa sinh lại nên `supabase.from("support_tickets")` không có trong union tên bảng — quay lại Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appTypes.ts src/lib/support.ts src/lib/database.types.ts
git commit -m "feat(support): type và lớp truy cập dữ liệu

Gom mọi truy cập PostgREST cho support vào src/lib/support.ts để hai màn
dùng chung mapper và cùng tuân quy tắc ghi xong phải tải lại."
```

---

## Task 4: Bỏ `as any` trên đường điều hướng tới `help`

**Files:**
- Modify: `src/components/Navigation.tsx`

**Interfaces:**
- Consumes: type `AppPage` đã export sẵn từ `src/lib/router.ts`.
- Produces: `Navbar.onNavigate` và `Sidebar.onNavigate` nhận `AppPage`. Task 7 dựa vào việc `"help"` là giá trị hợp lệ.

Việc này phải làm **trước** Task 7: `handleNotificationNavigate` cần điều hướng tới `"help"`, mà union hiện tại không có giá trị đó.

- [ ] **Step 1: Xác nhận điểm xuất phát sạch**

```bash
npm run lint
```

Kỳ vọng: không lỗi (đây là mốc so sánh cho Step 3).

- [ ] **Step 2: Sửa `src/components/Navigation.tsx`**

Thêm import:

```ts
import type { AppPage } from "../lib/router";
```

Trong props của `Navbar` (khoảng dòng 28), đổi:

```ts
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard") => void;
```

thành:

```ts
  onNavigate: (page: AppPage) => void;
```

Trong props của `Sidebar` (khoảng dòng 281), đổi:

```ts
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz") => void;
```

thành:

```ts
  onNavigate: (page: AppPage) => void;
```

Rồi bỏ ép kiểu ở lời gọi trong `Sidebar` (khoảng dòng 307):

```tsx
onClick={() => onNavigate(link.id as any)}
```

thành:

```tsx
onClick={() => onNavigate(link.id)}
```

Nếu TypeScript vẫn kêu vì `link.id` bị suy ra là `string`, khai kiểu cho mảng `links` ngay tại chỗ khai báo:

```ts
const links: { id: AppPage; label: string; desc: string; icon: LucideIcon }[] = [
```

`LucideIcon` import từ `lucide-react`. Nếu file chưa import, thêm `import type { LucideIcon } from "lucide-react";`.

- [ ] **Step 3: Kiểm tra type**

```bash
npm run lint
```

Kỳ vọng: vẫn không lỗi. Nếu xuất hiện lỗi mới ở `src/App.tsx` (vì `handleNavigate` nhận union hẹp hơn), sửa chữ ký `handleNavigate` trong `App.tsx` thành `(page: AppPage) => void` — `AppState["currentPage"]` vốn đã liệt kê đúng chín giá trị của `AppPage`.

- [ ] **Step 4: Kiểm tra bằng mắt trên browser**

```bash
npm run dev
```

Đăng nhập, bấm lần lượt từng mục sidebar. Kỳ vọng: mọi mục vẫn điều hướng như cũ, kể cả "Gói học" và "Trợ giúp học tập" (lúc này vẫn là `ComingSoonPage`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Navigation.tsx src/App.tsx
git commit -m "refactor(nav): bỏ as any trong Sidebar.onNavigate

Union onNavigate thiếu help/packages trong khi mảng links có, nên lời gọi
phải ép kiểu. Nới về AppPage để điều hướng tới màn Hỗ trợ là hợp lệ."
```

---

## Task 5: Màn học viên

**Files:**
- Create: `src/pages/SupportPage.tsx`
- Modify: `src/App.tsx` (nhánh render `help`)
- Reference: `docs/mockups/support-user-mockup.html`

**Interfaces:**
- Consumes: `listMyTickets`, `listMessages`, `createTicket`, `sendMessage` từ `src/lib/support.ts`; `SUPPORT_TOPIC_LABELS`, `SUPPORT_STATUS_LABELS` từ `src/lib/appTypes.ts`; `Button` từ `src/components/DesignSystem.tsx`; `showToast` từ `src/lib/toast.ts`.
- Produces: `export const SupportPage: React.FC` — không nhận prop nào.

**Về phần markup:** `docs/mockups/support-user-mockup.html` là bản đã duyệt, dùng làm nguồn cho bố cục và từng chuỗi tiếng Việt. Chuyển CSS sang Tailwind theo bảng dưới, đừng chép class CSS của mockup vào React.

| Mockup | Tailwind |
|---|---|
| `.card` | `bg-white border border-slate-200 rounded-2xl shadow-sm` |
| `.badge-pending` | `bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full` |
| `.badge-processing` | `bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full` |
| `.badge-resolved` | `bg-green-50 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full` |
| `.page-banner` | `bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 text-white` |
| `.bubble` | `bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-3 text-sm text-slate-700` |
| `.message.staff .bubble` | `bg-red-50 border-red-100 text-red-900` |

Một chỗ **lệch mockup có chủ ý**, đã ghi trong spec: thêm ô nhắn tiếp ở cuối thread, vì hội thoại nhiều lượt. Mockup chưa vẽ phần này.

- [ ] **Step 1: Viết khung state và tải dữ liệu**

Tạo `src/pages/SupportPage.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../components/DesignSystem";
import { showToast } from "../lib/toast";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketStatus,
  type SupportTicketTopic,
} from "../lib/appTypes";
import {
  createTicket,
  listMessages,
  listMyTickets,
  sendMessage,
} from "../lib/support";

const STATUS_BADGE: Record<SupportTicketStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-amber-50 text-amber-700",
  resolved: "bg-green-50 text-green-700",
};

export const SupportPage: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyTickets();
      setTickets(rows);
      // Ticket đang mở phải lấy bản mới: trạng thái do trigger server đổi.
      setActiveTicket((prev) =>
        prev ? rows.find((t) => t.id === prev.id) ?? null : null,
      );
    } catch {
      showToast("Không tải được danh sách yêu cầu hỗ trợ.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openTicket = async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    setMessages(await listMessages(ticket.id));
  };

  return null; // thay bằng JSX ở Step 3
};
```

- [ ] **Step 2: Thêm hai handler ghi dữ liệu**

Chèn vào trong component, trước `return`:

```tsx
  const handleCreate = async (
    title: string,
    topic: SupportTicketTopic,
    body: string,
  ) => {
    setSending(true);
    try {
      await createTicket(title, topic, body);
      setShowModal(false);
      showToast("Đã gửi yêu cầu hỗ trợ.", "success");
      await refresh();
    } catch (err) {
      // Trần 5 ticket đang mở do trigger dựng lên, ném về dạng check_violation.
      const message =
        err instanceof Error && err.message.includes("open limit")
          ? "Bạn đang có quá nhiều yêu cầu chưa xử lý xong. Vui lòng chờ phản hồi."
          : "Không gửi được yêu cầu. Vui lòng thử lại.";
      showToast(message, "warning");
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    const body = reply.trim();
    if (!body || !activeTicket) return;
    setSending(true);
    try {
      await sendMessage(activeTicket.id, body);
      setReply("");
      // Bắt buộc tải lại: trigger có thể vừa mở lại ticket sang processing.
      setMessages(await listMessages(activeTicket.id));
      await refresh();
    } catch {
      showToast("Không gửi được tin nhắn. Vui lòng thử lại.", "warning");
    } finally {
      setSending(false);
    }
  };
```

- [ ] **Step 3: Dựng JSX theo mockup**

Thay `return null` bằng JSX gồm bốn khối, bám `docs/mockups/support-user-mockup.html`:

1. **Banner** — tiêu đề "Trợ giúp học tập", mô tả "Gửi yêu cầu khi bạn gặp sự cố và theo dõi phản hồi từ đội ngũ SelbstDeutsch.", nút `<Button variant="primary" onClick={() => setShowModal(true)}>Tạo ticket mới</Button>`.
2. **Danh sách** (hiện khi `activeTicket === null`) — mỗi dòng gọi `openTicket(ticket)`, hiển thị `ticket.title`, `ticket.code`, `SUPPORT_TOPIC_LABELS[ticket.topic]`, ngày `new Date(ticket.createdAt).toLocaleDateString("vi-VN")`, và badge `SUPPORT_STATUS_LABELS[ticket.status]` với class `STATUS_BADGE[ticket.status]`. Khi `loading` hiện `<Skeleton />` từ `src/components/Skeleton.tsx`; khi rỗng hiện "Bạn chưa gửi yêu cầu hỗ trợ nào."
3. **Chi tiết** (hiện khi `activeTicket !== null`) — nút "← Quay lại danh sách" đặt `setActiveTicket(null)`; thread map `messages`, bong bóng căn phải + nền đỏ nhạt khi `message.isStaff`; **ô nhắn tiếp**: `<textarea value={reply} onChange={...} />` và `<Button onClick={handleReply} disabled={sending || !reply.trim()}>Gửi</Button>`.
4. **Modal tạo ticket** (hiện khi `showModal`) — ba trường: tiêu đề (input), chủ đề (select đổ từ `Object.entries(SUPPORT_TOPIC_LABELS)`, value là khoá tiếng Anh), mô tả (textarea). Validate cả ba trường không rỗng, hiện lỗi đỏ dưới trường thiếu, rồi gọi `handleCreate`. Nút đóng dùng `setShowModal(false)`.

- [ ] **Step 4: Nối vào `src/App.tsx`**

Thêm import:

```tsx
import { SupportPage } from "./pages/SupportPage";
```

Đổi nhánh render (khoảng dòng 427):

```tsx
              {effectivePage === "help" && user && (
                <ComingSoonPage title="Trợ giúp học tập" />
              )}
```

thành:

```tsx
              {effectivePage === "help" && user && <SupportPage />}
```

Giữ nguyên import `ComingSoonPage` — nhánh `packages` vẫn dùng.

- [ ] **Step 5: Kiểm tra type**

```bash
npm run lint
```

Kỳ vọng: không lỗi.

- [ ] **Step 6: Kiểm chứng trên browser**

```bash
npm run dev
```

Đăng nhập bằng tài khoản học viên, vào `/help`, rồi lần lượt:

1. Bấm "Tạo ticket mới", bấm gửi khi để trống → hiện lỗi ở cả ba trường, modal không đóng.
2. Điền đủ ba trường rồi gửi → modal đóng, toast "Đã gửi yêu cầu hỗ trợ.", ticket mới xuất hiện đầu danh sách với badge "Đang chờ xử lý" và mã dạng `SD-1000`.
3. Mở ticket vừa tạo → thread hiện đúng nội dung mô tả đã nhập.
4. Nhắn thêm một tin → tin xuất hiện trong thread, ô nhập trống lại.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SupportPage.tsx src/App.tsx
git commit -m "feat(support): màn hỗ trợ cho học viên

Thay ComingSoonPage ở /help. Sau mỗi thao tác ghi đều tải lại ticket và
thread vì trạng thái do trigger phía server quyết."
```

---

## Task 6: Màn admin

**Files:**
- Create: `src/pages/admin/AdminSupportSection.tsx`
- Modify: `src/pages/admin/AdminPage.tsx`
- Reference: `docs/mockups/support-admin-mockup.html`

**Interfaces:**
- Consumes: `listAllTickets`, `listMessages`, `sendMessage`, `updateTicketStatus` từ `src/lib/support.ts`.
- Produces: `export const AdminSupportSection: React.FC`; giá trị `"support"` trong type `AdminSection` — Task 7 gọi `setSection("support")`.

Bám `docs/mockups/support-admin-mockup.html` cho bố cục và chuỗi tiếng Việt; bám `src/pages/admin/AdminUsersSection.tsx` cho class Tailwind của bảng, ô tìm kiếm và phân trang. Accent của admin là **cam** (`orange-600`), không phải đỏ.

- [ ] **Step 1: Thêm section vào `AdminPage.tsx`**

Đổi type:

```ts
export type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing" | "support";
```

Thêm import `MessageSquare` vào khối import từ `lucide-react`, thêm import section, thêm mục vào `NAV_ITEMS` (sau `writing`):

```ts
  { id: "support", label: "Hỗ trợ", Icon: MessageSquare },
```

Thêm nhánh render:

```tsx
        {section === "support" && <AdminSupportSection />}
```

- [ ] **Step 2: Viết khung `AdminSupportSection.tsx`**

```tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketStatus,
} from "../../lib/appTypes";
import {
  listAllTickets,
  listMessages,
  sendMessage,
  updateTicketStatus,
} from "../../lib/support";

const PAGE_SIZE = 15;

const STATUS_PILL: Record<SupportTicketStatus, string> = {
  pending: "bg-slate-100 text-slate-500",
  processing: "bg-amber-50 text-amber-600 border border-amber-200",
  resolved: "bg-green-50 text-green-600 border border-green-200",
};

export const AdminSupportSection: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllTickets();
      setTickets(rows);
      setActive((prev) => (prev ? rows.find((t) => t.id === prev.id) ?? null : null));
    } catch {
      showToast("Không tải được danh sách ticket.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [tickets, search, statusFilter]);

  // Ba thẻ số liệu suy từ chính danh sách đã tải, không query đếm riêng.
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      pending: tickets.filter((t) => t.status === "pending").length,
      processing: tickets.filter((t) => t.status === "processing").length,
      resolvedThisWeek: tickets.filter(
        (t) => t.status === "resolved" && new Date(t.updatedAt).getTime() >= weekAgo,
      ).length,
    };
  }, [tickets]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return null; // thay bằng JSX ở Step 4
};
```

- [ ] **Step 3: Thêm ba handler**

```tsx
  const openTicket = async (ticket: SupportTicket) => {
    setActive(ticket);
    setMessages(await listMessages(ticket.id));
  };

  const handleStatus = async (status: SupportTicketStatus) => {
    if (!active) return;
    setBusy(true);
    try {
      await updateTicketStatus(active.id, status);
      await refresh();
      showToast(`Ticket ${active.code} chuyển sang ${SUPPORT_STATUS_LABELS[status]}.`, "success");
    } catch {
      showToast("Không đổi được trạng thái.", "warning");
    } finally {
      setBusy(false);
    }
  };

  const handleReply = async () => {
    const body = reply.trim();
    if (!body || !active) return;
    setBusy(true);
    try {
      await sendMessage(active.id, body);
      setReply("");
      // Trigger vừa đặt ticket sang resolved — phải tải lại mới thấy đúng.
      setMessages(await listMessages(active.id));
      await refresh();
      showToast("Đã gửi phản hồi cho học viên.", "success");
    } catch {
      showToast("Không gửi được phản hồi.", "warning");
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 4: Dựng JSX theo mockup**

Thay `return null` bằng hai chế độ hiển thị:

**Danh sách** (khi `active === null`):
1. Hàng đầu: `<h1 className="text-xl font-display font-black text-slate-900">Hỗ trợ ({filtered.length})</h1>` và ô tìm kiếm `w-52` có icon `Search` đặt tuyệt đối bên trái — chép class từ `AdminUsersSection.tsx` dòng 303–311.
2. Ba thẻ số liệu (`grid grid-cols-1 sm:grid-cols-3 gap-4`), mỗi thẻ `bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm`, số dùng `text-2xl font-display font-black`: `stats.pending` "Ticket đang chờ", `stats.processing` "Đang xử lý", `stats.resolvedThisWeek` "Đã xử lý trong tuần".
3. Thanh lọc: select trạng thái đổ từ `SUPPORT_STATUS_LABELS` cộng lựa chọn "Tất cả trạng thái" (`value="all"`), đặt `setStatusFilter` và `setPage(1)`.
4. Bảng: cột Mã (`font-mono text-xs text-slate-400`), Tiêu đề, Học viên (`ticket.author?.fullName || ticket.author?.email || "—"`), Chủ đề (`SUPPORT_TOPIC_LABELS[ticket.topic]`), Trạng thái (pill dùng `STATUS_PILL`), Ngày tạo. Mỗi `<tr>` gọi `openTicket(ticket)`. Khi `loading` hiện `<Loader2 className="w-6 h-6 text-orange-500 animate-spin" />`; khi `paginated.length === 0` hiện một hàng "Không có ticket nào."
5. Phân trang chỉ hiện khi `totalPages > 1` — chép cấu trúc từ `AdminUsersSection.tsx` dòng 472–489.

**Chi tiết** (khi `active !== null`): nút quay lại đặt `setActive(null)`; thread map `messages` (bong bóng `bg-orange-50 border-orange-200` căn phải khi `isStaff`); ô phản hồi kèm hai nút — `<Button variant="secondary" onClick={() => handleStatus("processing")} disabled={busy}>Bắt đầu xử lý</Button>` và `<Button variant="primary" onClick={handleReply} disabled={busy || !reply.trim()}>Gửi phản hồi & hoàn tất</Button>`; panel phải gồm thông tin học viên (`active.author`), thông tin ticket, và select trạng thái gọi `handleStatus`.

- [ ] **Step 5: Kiểm tra type**

```bash
npm run lint
```

Kỳ vọng: không lỗi.

- [ ] **Step 6: Kiểm chứng trên browser**

```bash
npm run dev
```

Vào `/admin`, đăng nhập bằng tài khoản có `app_metadata.role = "admin"`, mở mục "Hỗ trợ":

1. Ticket tạo ở Task 5 phải hiện trong bảng, cột "Học viên" có tên hoặc email — **không được rỗng**. Rỗng nghĩa là nhúng `profiles` hỏng.
2. Ba thẻ số liệu khớp với số dòng trong bảng.
3. Mở ticket → thread hiện tin của học viên.
4. Bấm "Bắt đầu xử lý" → pill đổi sang "Đang xử lý", toast hiện.
5. Gõ phản hồi rồi bấm "Gửi phản hồi & hoàn tất" → bong bóng cam xuất hiện, pill đổi sang "Đã xử lý".

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminSupportSection.tsx src/pages/admin/AdminPage.tsx
git commit -m "feat(support): section hỗ trợ trong admin

Bảng ticket, lọc và ba thẻ số liệu đều suy từ một lần tải danh sách, theo
đúng khuôn AdminUsersSection."
```

---

## Task 7: Nối thông báo cả hai phía

**Files:**
- Modify: `src/App.tsx` (`handleNotificationNavigate`, khoảng dòng 219)
- Modify: `src/pages/admin/AdminApp.tsx` (`handleNotificationNavigate`)

**Interfaces:**
- Consumes: ba giá trị `notifications.type` từ Task 2; `"help"` là `AppPage` hợp lệ từ Task 4; `"support"` là `AdminSection` hợp lệ từ Task 6.
- Produces: không có gì cho task sau.

- [ ] **Step 1: Nối phía học viên**

Trong `src/App.tsx`, đổi:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_graded" && n.lessonId) {
      handleSelectLesson(n.lessonId, "viet");
    }
  };
```

thành:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_graded" && n.lessonId) {
      handleSelectLesson(n.lessonId, "viet");
      return;
    }
    if (n.type === "support_replied") {
      setCurrentPage("help");
    }
  };
```

- [ ] **Step 2: Nối phía admin**

Trong `src/pages/admin/AdminApp.tsx`, đổi:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_submitted") setSection("writing");
  };
```

thành:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_submitted") setSection("writing");
    if (n.type.startsWith("support_")) setSection("support");
  };
```

- [ ] **Step 3: Kiểm tra type**

```bash
npm run lint
```

Kỳ vọng: không lỗi.

- [ ] **Step 4: Kiểm chứng trên browser**

Cần hai cửa sổ: một đăng nhập học viên, một đăng nhập admin (dùng cửa sổ ẩn danh cho cái thứ hai).

1. Học viên tạo ticket mới → chuông **admin** hiện thông báo "Có ticket hỗ trợ mới: …". Bấm vào → nhảy đúng mục "Hỗ trợ".
2. Admin gửi phản hồi → chuông **học viên** hiện "Ticket SD-… đã có phản hồi…". Bấm vào → nhảy đúng màn `/help`.

Bước 2 là bước dễ bị bỏ sót nhất trong toàn kế hoạch — nếu bấm vào mà không có gì xảy ra thì Step 1 chưa ăn.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/admin/AdminApp.tsx
git commit -m "feat(support): nối điều hướng thông báo cả hai phía

Chuông phía học viên có thật trong Navbar, thiếu nhánh support_replied
thì bấm vào thông báo sẽ không có gì xảy ra."
```

---

## Task 8: Kiểm chứng bất biến qua PostgREST và chạy trọn vòng

**Files:** không sửa file nào. Task này chỉ chạy kiểm chứng; nếu phát hiện lỗi thì quay lại đúng task gây ra.

Hai bất biến quan trọng nhất **không thể chạm tới qua giao diện** — giao diện không bao giờ gửi `code` hay `is_staff`. Phải gọi thẳng API để biết chúng có thật hay không.

- [ ] **Step 1: Lấy access token của một tài khoản học viên**

Chạy `npm run dev`, đăng nhập học viên, mở DevTools Console:

```js
const { data } = await window.supabase.auth.getSession();
copy(data.session.access_token);
```

Nếu `window.supabase` không tồn tại, lấy từ Application → Local Storage, khoá bắt đầu bằng `sb-` — token nằm ở trường `access_token`.

- [ ] **Step 2: Thử gửi `code` bịa**

Thay `<TOKEN>` và `<ANON_KEY>` (lấy từ `.env.local`, biến `VITE_SUPABASE_ANON_KEY`):

```bash
curl -s -X POST 'http://127.0.0.1:54321/rest/v1/support_tickets' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d '{"title":"Thử ghi đè code","topic":"other","code":"SD-0001"}'
```

Kỳ vọng: trả về ticket có `"code"` dạng `SD-<số lớn>`, **không phải** `SD-0001`. Nếu đúng `SD-0001` thì trigger `support_ticket_set_code` không chạy — quay lại Task 2.

- [ ] **Step 3: Thử giả danh support**

Lấy `id` của ticket vừa tạo ở Step 2, thay vào `<TICKET_ID>`, và `<USER_ID>` là `sub` trong token:

```bash
curl -s -X POST 'http://127.0.0.1:54321/rest/v1/support_ticket_messages' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d '{"ticket_id":"<TICKET_ID>","author_id":"<USER_ID>","is_staff":true,"body":"giả danh"}'
```

Kỳ vọng: trả về tin nhắn có `"is_staff": false`. Nếu là `true` thì trigger `support_message_set_is_staff` không chạy — quay lại Task 2. Đây là lỗ hổng nghiêm trọng: học viên gửi được tin nhắn hiện ra như phản hồi chính thức.

- [ ] **Step 4: Thử đọc ticket của người khác**

Đăng nhập tài khoản học viên **thứ hai**, lấy token của tài khoản đó, rồi:

```bash
curl -s 'http://127.0.0.1:54321/rest/v1/support_tickets?select=id,code,title' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <TOKEN_HỌC_VIÊN_2>'
```

Kỳ vọng: **không** thấy ticket của học viên thứ nhất. Nếu thấy thì policy `support_tickets: own read` sai — quay lại Task 1.

Nếu chưa có tài khoản thứ hai và không tạo được, **phải nói rõ là chưa kiểm chứng được bước này**, không được coi như đã xong.

- [ ] **Step 5: Chạy trọn vòng trên giao diện**

Hai cửa sổ (học viên và admin), theo đúng thứ tự:

1. Học viên tạo ticket → admin thấy trong bảng, badge "Đang chờ xử lý".
2. Admin bấm "Bắt đầu xử lý" → học viên tải lại `/help`, badge là "Đang xử lý".
3. Admin gửi phản hồi → học viên tải lại, badge là "Đã xử lý", thread có bong bóng phản hồi.
4. Học viên nhắn tiếp → admin tải lại, badge quay về **"Đang xử lý"**.

Bước 4 là phép thử cho quy tắc "ghi xong phải tải lại". Nếu badge vẫn là "Đã xử lý" trên màn admin sau khi tải lại, trigger `support_message_after_insert` sai; nếu badge chỉ sai khi **không** tải lại trang thì một trong hai màn đang vá state tại chỗ thay vì gọi `refresh()`.

- [ ] **Step 6: Dọn dữ liệu thử và kiểm tra lần cuối**

```bash
supabase db reset
npm run lint
```

Kỳ vọng: reset sạch, lint không lỗi.

- [ ] **Step 7: Commit (nếu có sửa gì trong lúc kiểm chứng)**

```bash
git add -A
git commit -m "fix(support): sửa sau kiểm chứng trọn vòng"
```

Nếu không sửa gì thì bỏ qua bước này.

---

## Ghi chú về kiểm thử tự động

Repo **không có test runner nào được cấu hình**: `package.json` chỉ có script `lint` (`tsc --noEmit`). Các file `src/**/*.test.tsx` hiện không có runner chạy; `playwright` nằm trong `devDependencies` nhưng không có script gọi tới.

Vì vậy kế hoạch này không có bước "chạy unit test" — thay vào đó mỗi task ở tầng SQL có một file probe tự khẳng định bằng `RAISE EXCEPTION`, và mỗi task ở tầng giao diện có danh sách thao tác cụ thể trên browser. Đó là mức kiểm chứng cao nhất mà bộ công cụ hiện tại của repo cho phép.

Nếu muốn có test tự động thật, việc đó là **thêm dependency mới** (vitest + testing-library, hoặc script cho playwright) — CLAUDE.md yêu cầu hỏi trước, nên nó nằm ngoài kế hoạch này.
