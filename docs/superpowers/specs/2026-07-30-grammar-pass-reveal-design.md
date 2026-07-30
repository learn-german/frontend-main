# Phase 2 — Pass 80%, mở lời giải, attempt theo set

Ngày: 2026-07-30

Yêu cầu #1 trong `requirement.md`. Phase 2 trong
[roadmap nền tảng bài tập](./2026-07-30-exercise-platform-roadmap.md). Đứng
trên nền `exercise_sets` từ Phase 1 (branch `claude/exercise-sets-phase1`,
[PR #76](https://github.com/learn-german/frontend-main/pull/76), chưa merge
nhưng đã áp migration lên production).

## Bối cảnh — hai vấn đề đang sống thật trên production

**1. `explanation` đang lộ vô điều kiện.** `useGrammarExercises.ts:22` select
thẳng `explanation` từ `grammar_exercises_public`, và
`GrammarExercisePage.tsx:616` hiện nó ngay trong card kết quả **không kèm
điều kiện nào** — học viên nộp bài lần đầu, dù 0%, vẫn thấy giải thích đầy
đủ. Đây chính là AC đầu tiên của requirement mà hệ thống đang vi phạm.

**2. `GrammarExercisePage` là 1 trang phẳng cho cả lesson**, không có khái
niệm "set hiện tại" hay khóa tuần tự. `useGrammarExercises(lesson.id)` tải
toàn bộ câu hỏi của lesson, nộp 1 lần cho tất cả. Nút "Tiếp tục" hiện nhảy
sang **lesson khác**, không phải set khác trong cùng lesson — vì tại thời
điểm code này viết, khái niệm "set" chưa tồn tại.

Phase 2 sửa cả hai, dựng đúng luồng pass/attempt/reveal theo set như
requirement mô tả.

## Data model

```sql
DROP TABLE grammar_attempts;

CREATE TABLE exercise_set_attempts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  set_id             UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  category           TEXT        NOT NULL,
  answers            JSONB       NOT NULL,
  blank_results      JSONB       NOT NULL DEFAULT '{}',
  choice_results     JSONB       NOT NULL DEFAULT '{}',
  exercise_results   JSONB       NOT NULL DEFAULT '{}',
  score              INTEGER     NOT NULL,
  total              INTEGER     NOT NULL,
  best_score         INTEGER     NOT NULL,
  attempt_count      INTEGER     NOT NULL DEFAULT 1,
  is_passed          BOOLEAN     NOT NULL,
  revealed           BOOLEAN     NOT NULL DEFAULT FALSE,
  last_submission_id TEXT        NOT NULL,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_id)
);

ALTER TABLE exercise_set_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_attempts: own read"
  ON exercise_set_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- Không có policy admin-all — bài học trực tiếp từ lỗ hổng RLS đã vá hôm nay
-- (grammar_attempts: admin all khiến mọi tài khoản admin đọc được kết quả
-- của user khác qua chính trang học viên bình thường). Chỉ service_role
-- (Edge Function) ghi bảng này.
```

`grammar_attempts` hiện có đúng 1 row thật (dữ liệu tự test, `score 91`) —
xóa theo giả định nền đã áp dụng xuyên suốt (hệ thống chưa có user thật).

**Rollup `lesson_progress.quiz_score`:** sau mỗi lần chấm 1 set, `grammar-
submit` truy vấn toàn bộ set `category = 'nguphap'` của lesson đó. Nếu
**tất cả** đã `is_passed = true` → ghi `quiz_score = 100`; ngược lại ghi
trung bình `best_score` của các set (set chưa làm tính là 0).

Không dùng `0` cứng cho nhánh còn lại: `stats.quizScores` (nguồn của
`quiz_score`) được hiển thị trực tiếp trên Dashboard
(`DashboardPage.tsx:50`, mục "Bài kiểm tra gần đây"), không chỉ dùng để so
ngưỡng — ghi `0` mỗi khi chưa pass hết sẽ khiến học viên đã pass 3/4 set
điểm cao thấy Dashboard hiện `0%`, trông như tụt lùi. Trung bình luôn nhỏ
hơn giá trị gate (gate là điều kiện boolean tách biệt "tất cả pass", không
suy ra từ trung bình), nên không ảnh hưởng `isLessonComplete()` hay bất kỳ
logic Roadmap/admin nào khác — chúng chỉ đọc `quiz_score >= 80`.

## Bảo mật: gỡ `explanation` khỏi đường công khai

`grammar_exercises_public` (Phase 1 vừa sửa view này) bỏ cột `explanation`
khỏi SELECT list. `useGrammarExercises.ts` bỏ `explanation` khỏi câu query.
Từ đây, giải thích **chỉ** đi ra từ response của `grammar-submit`, và chỉ
khi `revealed = true`.

## `grammar-submit` v2

**Request:**

```json
{ "set_id": "uuid", "submission_id": "uuid", "answers": { "...": "..." } }
```

**Response:**

```json
{
  "score": 80,
  "total": 5,
  "isPassed": true,
  "revealed": false,
  "attemptCount": 1,
  "bestScore": 80,
  "blankResults": {},
  "choiceResults": {},
  "exerciseResults": { "...": true },
  "correctAnswers": { "...": "..." },
  "explanations": { "...": "..." }
}
```

`correctAnswers`/`explanations` **chỉ có mặt trong response khi
`revealed = true`** — không phải field rỗng, mà hoàn toàn không xuất hiện
trong JSON, để không rò rỉ shape ngay cả khi client đọc key mù.

**Tính điểm (BR-02):**

```
isPassed = correctCount * 100 >= totalQuestions * 80
```

Số nguyên, không làm tròn `score` trước khi so sánh.

**Điều kiện mở khóa (`revealed`):**

```
revealed = (correctCount === totalQuestions) OR (attempt_count >= 5)
```

Một khi `revealed = true` trong DB, giữ `true` vĩnh viễn — kể cả các lần nộp
sau đó điểm thấp hơn (test case "Lần 6, 4/5 → lời giải vẫn mở", roadmap).
`isPassed` và `revealed` là hai cờ độc lập: lần 5 đạt 60% thì `revealed =
true` nhưng `is_passed = false`.

**Idempotency (BR-06):** client sinh `submission_id` (UUID) **một lần** khi
bắt đầu một lượt làm bài — lúc mount trang set hoặc lúc bấm "Làm lại" — giữ
nguyên cho mọi lần bấm "Nộp bài" trong lượt đó, không sinh lại mỗi click.
Server: nếu `submission_id` đến trùng `last_submission_id` đã lưu cho
`(user_id, set_id)`, trả lại đúng row hiện có, **không tăng**
`attempt_count`, không chấm lại. Nếu khác, chấm bình thường, tăng
`attempt_count`, cập nhật `last_submission_id`.

Không tăng attempt khi: reload trang (không có request submit nào), request
validation fail trước khi tới bước ghi, lỗi trước khi transaction commit,
hoặc trùng `submission_id`.

**XP:** giữ nguyên tổng XP như trước — **30 XP một lần cho cả lesson**, thưởng
đúng lúc `lesson_progress.quiz_score` (nguphap) chuyển từ `<100` sang `100`
(tức toàn bộ set vừa được pass hết, không phải mỗi lần pass 1 set). Không đổi
sang thưởng theo từng set — lesson có nhiều set sẽ lạm phát tổng XP so với
trước nếu làm vậy. Chống thưởng trùng khi 2 request submit các set khác nhau
của cùng lesson chạy gần đồng thời: đọc `quiz_score` hiện tại của lesson
**trước khi** upsert; chỉ thưởng nếu giá trị cũ `< 100` và giá trị mới `= 100`.

**Bug đang có, phải sửa trong Phase 2:** `grammar-submit` hiện tại tính
`passed = score >= PASS_THRESHOLD` trên `score` đã làm tròn
(`computeGrammarScore` trả `Math.round((correct/total)*100)`) — đúng lỗi làm
tròn BR-02 cảnh báo (`77.78%` có thể vô tình làm tròn thành `78%` gần `80%`,
hoặc một tỷ lệ như `79.5%` làm tròn thành `80%` rồi bị tính Pass sai). Phase 2
tính `isPassed` trực tiếp từ `correct * 100 >= total * 80` (đã có sẵn
`correct`/`total` chưa làm tròn trong `ScoreResult`), không dùng `score`
(giá trị `score` làm tròn vẫn giữ lại, chỉ dùng để hiển thị).

## Frontend

**Route:** thêm cấp `setId` vào route `quiz` hiện có.

```
/quiz/:lessonId/nguphap            → danh sách set (mới)
/quiz/:lessonId/nguphap/:setId     → trang làm bài (set cụ thể)
```

Khớp nguyên tắc "URL là hình chiếu của state" đã xây (`router.ts`), giữ
đúng set đang làm khi F5/deep-link.

**Màn hình danh sách set** (component mới, ví dụ `GrammarSetListPage`):
liệt kê `exercise_sets` của lesson theo `order_index`, mỗi dòng hiện
`title` và badge trạng thái:

- **Khóa** — set trước chưa `is_passed`, không bấm được.
- **Cần làm** — set đầu tiên chưa khóa.
- **Đạt** — `is_passed = true`.

**Trang làm bài (per-set):**

- `useGrammarExercises` đổi tham số từ `lessonId` sang `setId`, query lọc
  `grammar_exercises_public.set_id = :setId` thay vì `lesson_id`.
- Card kết quả giữ nguyên cấu trúc hiện có (đúng/sai từng câu, `x/y`, tỷ lệ,
  badge Đạt/Chưa đạt) nhưng scope theo set thay vì cả lesson.
- Chưa đạt → chỉ nút **Làm lại**. Đạt → nút **Tiếp tục** điều hướng **về màn
  hình danh sách set** (không tự động nhảy vào set kế tiếp) — học viên tự
  thấy set nào vừa mở khóa và tự chọn vào.
- Đáp án đúng/giải thích trong card kết quả đọc từ state nhận được ở response
  `grammar-submit` (`correctAnswers`/`explanations`), không phải từ
  `ex.explanation` như hiện tại. Ẩn hoàn toàn phần này nếu `revealed = false`.
- Hydrate lúc mount: đọc `exercise_set_attempts` của `(user, set)`, khôi phục
  đúng `revealed`/`is_passed`/snapshot bài đã nộp — giữ trạng thái qua reload
  và qua làm lại (AC cuối cùng của requirement).

## Rủi ro cần canh khi triển khai

Đây đúng vùng vừa có 4 commit sửa lỗi hydrate/ghi đè liên tiếp trên
`GrammarExercisePage` (`23c7760`, `3db99a7`, và 2 commit khác cùng đợt —
xem `git log --oneline -- src/pages/GrammarExercisePage.tsx`). Phải có test
cho đường **hydrate** (mount lại giữa chừng, F5 sau khi đã pass, F5 sau khi
đã mở lời giải), không chỉ đường submit — lặp lại đúng loại lỗi đã xảy ra
trước đây sẽ là thất bại nghiêm trọng nhất của phase này.

## Testing

- Migration: verify `exercise_set_attempts` tồn tại đúng cột, RLS bật, chỉ
  1 policy own-read (không có admin-all).
- Unit test `computeGrammarScore`/`projectAnswers` hiện có (`scoring.test.ts`)
  không đổi — vẫn nhận input theo exercise, không đổi shape.
- Unit test mới cho logic `isPassed`/`revealed` (hàm thuần, tách khỏi
  `index.ts` để test không cần Deno-serve) — bao phủ đúng 6 test case trong
  bảng của requirement.
- Test hydrate cho `GrammarExercisePage`/set list: dùng lại pattern Playwright
  harness đã dựng ở Phase 0 (`tests/e2e/classification-fields/`) nếu cần
  test tương tác thật; nếu tách được state logic thuần (hydrate reducer) thì
  test bằng `node:test` thường, không cần trình duyệt.

## Acceptance Criteria

- [ ] API không trả `correctAnswers`/`explanations` khi `revealed = false`.
- [ ] Đúng toàn bộ ở bất kỳ lần nào → `revealed = true` ngay lập tức.
- [ ] Từ lần thứ 5 → `revealed = true` dù còn câu sai.
- [ ] `isPassed` chỉ true khi `correctCount * 100 >= totalQuestions * 80`.
- [ ] Set dưới 80% không mở khóa set kế tiếp trong danh sách.
- [ ] Set từ 80% trở lên hiện nút Tiếp tục, mở khóa set kế tiếp trong danh sách.
- [ ] Lần thứ 5 không tự động pass nếu vẫn dưới 80%.
- [ ] Sau lần 5, học viên vẫn làm lại được tới khi pass.
- [ ] `attempt_count` tính riêng theo từng `(user, set)`.
- [ ] Reload, submit lỗi, hoặc trùng `submission_id` không tăng `attempt_count`.
- [ ] `revealed` giữ nguyên qua reload và qua làm lại.
- [ ] `lesson_progress.quiz_score` (nguphap) = 100 chỉ khi mọi set của lesson đã pass.
- [ ] `explanation` không xuất hiện trong bất kỳ response PostgREST nào (view public).

## Out of scope

- UI ghép nhiều group vào 1 set (đã loại ở Phase 1).
- Category `nghe`/`doc` — API/schema category-agnostic nhưng chưa có set nào
  thuộc 2 category này (Phase 4).
- Lưu đáp án đang làm dở khi chưa nộp (Phase 3).
- Thay đổi nội dung câu hỏi/đáp án/giải thích do admin tạo.
- Tính điểm chung cho toàn bộ video.
