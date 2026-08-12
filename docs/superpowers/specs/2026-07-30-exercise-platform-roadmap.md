# Lộ trình nền tảng bài tập & Daily Progress Report

Ngày: 2026-07-30 (cập nhật 2026-08-12 — dọn các phase đã xong, xem git log từng
file để lại đầy đủ lịch sử/rationale, tài liệu này chỉ giữ phần còn phải làm).

Tài liệu này là **roadmap cấp trên**, không phải spec triển khai. Chỉ giữ những gì
**chưa xong** hoặc còn cần quyết định — phần đã hoàn thành xem lại qua git log
(commit message, spec/plan trong `docs/superpowers/specs|plans/`) thay vì lặp lại
ở đây.

## Giả định nền

> Hệ thống đang ở giai đoạn phát triển, **chưa có người dùng thật**. Mọi migration
> được phép xoá và tạo lại dữ liệu học viên mà không cần đường migrate bảo toàn
> hay backup.
>
> **Giả định này hết hiệu lực ngay khi có user thật.** Từ thời điểm đó, mọi phần
> còn lại phải quay về lối migrate bảo toàn dữ liệu.

## Đã hoàn thành (tóm tắt, không lặp chi tiết)

- **Phase 0 — Bug admin bài tập phân loại.** Xong.
- **Phase 1 — Nền `exercise_sets`.** Xong — `exercise_sets` là đơn vị chấm điểm/
  attempt/pass cho cả Ngữ pháp/Nghe/Đọc, `group_id` giữ song song để gom câu cùng
  dạng chung hint (không phải đơn vị chấm điểm).
- **Phase 2 — Pass 80%, gate lời giải, attempt theo set.** Xong —
  `computeSetAttemptUpdate` (isPassed/revealed sticky, BR-02 không làm tròn),
  idempotency theo `submission_id`. Quyết định sản phẩm 2026-08-05: bài tập
  **không khoá tuần tự** (khác bản nháp gốc) — học viên mở bài nào cũng được.
- **Phase 3 — Lưu đáp án đang làm dở.** Xong — `exercise_set_drafts`, áp dụng cả
  3 category.
- **Component dùng chung 10 loại câu hỏi** (nhập bài làm, review đúng/sai, admin
  form) cho cả Ngữ pháp/Nghe/Đọc. Xong — xem
  [2026-08-05-shared-exercise-answer-input-design.md](2026-08-05-shared-exercise-answer-input-design.md),
  [2026-08-05-shared-exercise-result-review-design.md](2026-08-05-shared-exercise-result-review-design.md),
  [2026-08-06-admin-shared-exercise-form-design.md](2026-08-06-admin-shared-exercise-form-design.md).
- **Phase 4 (Nghe)** — port xong qua `category = "nghe"` dùng chung
  `AdminGrammarExerciseSection`/`grammar_exercises`.
- **Phase 4 (Đọc)** — tiếp cận ban đầu (dùng chung `grammar_exercises`) **bị thay
  thế** bởi Phase 6 (bảng riêng `reading_passages`/`reading_question_groups`, cấu
  trúc lồng nhau không hợp shape phẳng của `grammar_exercises`).
- **Phase 6a — Admin tạo/sửa bài đọc**, kể cả nhiều văn bản/bài đọc. Xong — xem
  [2026-08-10-reading-exercise-admin-design.md](2026-08-10-reading-exercise-admin-design.md),
  [2026-08-11-reading-exercise-multi-passage-design.md](2026-08-11-reading-exercise-multi-passage-design.md).
- **Phase 6b — Học viên làm bài đọc + chấm điểm**, Edge Function `reading-submit`
  riêng. Xong — xem
  [2026-08-10-reading-exercise-learner-design.md](2026-08-10-reading-exercise-learner-design.md).
- **Phase 6c — Làm bài đọc từng đoạn + admin reorg.** Xong — làm bài tách theo
  từng đoạn văn (chấm + hiện đáp án ngay sau mỗi đoạn), tab "Lesen" bỏ preview văn
  bản (chỉ còn CTA), Admin "Đọc" nhóm theo Level giống "Ngữ pháp". Xem
  [2026-08-12-reading-exercise-per-passage-flow-design.md](2026-08-12-reading-exercise-per-passage-flow-design.md).
- **Daily Progress Report — Phase A (backend).** Xong (2026-08-07) — migration,
  Edge Function `daily-progress-report`, scheduled job `pg_cron`, wiring Admin gói
  học. Xem [2026-08-07-daily-progress-report-backend-design.md](2026-08-07-daily-progress-report-backend-design.md).
  **Cần thao tác thủ công còn nợ:** tạo Vault secret `service_role_key` trên
  Supabase dashboard để cron job chạy được (không tự làm được, không có quyền đọc
  giá trị thật của `SUPABASE_SERVICE_ROLE_KEY`).

## Còn phải làm

### Daily Progress Report — Phase B (frontend)

**Bị bỏ theo quyết định 2026-08-12** (ghi lại để không ai vô tình làm lại). Phase
A (backend) vẫn giữ nguyên, chạy được độc lập — chỉ không xây UI
`useDailyProgressReport`/`DailyProgressReportCard` trên Learning Dashboard nữa.

### Phase 5a — Nền gói cước / kế hoạch level

**Bị bỏ theo quyết định product owner** (ghi lại để không ai vô tình làm lại).
Daily Progress Report chạy ở chế độ rút gọn, thiếu `expected_progress`,
`progress_gap`, `package_remaining_days` — trả `insufficient_data` cho các trường
đó.

## Việc tiếp theo — backlog nhỏ, quy trình bắt buộc

Các mục dưới đây là yêu cầu rời rạc, chưa thuộc phase nào ở trên và **chưa triển
khai**. Khi bắt đầu bất kỳ mục nào, phải đi đúng 3 bước, theo thứ tự:

1. `/superpowers:brainstorming` — làm rõ yêu cầu, chốt phạm vi + design, viết spec
   trước khi đụng code (kể cả khi mục nhìn có vẻ đơn giản).
2. `/ponytail:ponytail` — khi implement, giữ giải pháp tối giản, không thêm
   abstraction/thư viện không cần thiết.
3. `/gitnexus-cli` (bộ công cụ GitNexus nói chung — `impact`, `context`, `query`) —
   chạy impact analysis trước khi sửa hoặc xoá bất kỳ symbol nào đang được dùng ở
   nhiều nơi, xác nhận không phá luồng khác trước khi commit.

### Task 1 — Xoá dạng bài "Điền vào chỗ trống"

**Nguồn:** yêu cầu 2026-08-12, kèm ảnh chụp modal "Thêm bài tập mới" trong Admin
Ngữ pháp (`AdminGrammarExerciseSection.tsx`) — dropdown "Loại bài tập" đang có lựa
chọn "Điền vào chỗ trống" (`fill_in_the_blank`).

Xoá dạng bài tập này khỏi hệ thống — không còn là lựa chọn khi admin tạo bài tập
mới. Phạm vi cụ thể **chưa chốt**, brainstorm khi bắt đầu task này, tối thiểu cần
trả lời:

- Bài tập `fill_in_the_blank` đang tồn tại trong DB: xoá thẳng hay giữ lại
  (chỉ ẩn lựa chọn tạo mới, học viên cũ vẫn thấy bài cũ nếu có)?
- `src/lib/grammarFillInBlank.ts` (`normalizeWordBank`, `syncBlankDefinitions`,
  `BlankDefinition`, `WordBank`) và UI nhập liệu tương ứng trong
  `AdminGrammarExerciseSection.tsx` (`ExerciseEntryFields`, khối
  `entry.type === "fill_in_the_blank"`) — xoá hẳn hay giữ lại phòng dùng lại sau?
- `word_bank` liên quan đến cả `text_fill_blank` (dạng khác, đang dùng chung field
  `word_bank`?) — cần `impact`/`context` xác nhận trước khi xoá, tránh xoá nhầm
  logic dùng chung.
- Ảnh hưởng `GrammarExerciseHint`, `grammar-submit` (chấm điểm `fill_in_the_blank`),
  và dữ liệu học viên đã làm dạng này (nếu có).

## Ngoài phạm vi toàn bộ roadmap

- Thay đổi nội dung câu hỏi, đáp án hoặc giải thích do admin đã tạo.
- Tính điểm chung cho toàn bộ video.
- Cho phép bỏ qua bài tập chưa pass.
- Gửi Daily Report qua email hoặc push notification.
- Báo cáo tuần/tháng, biểu đồ xu hướng, AI phân tích nguyên nhân học chậm.
- Đổi tên `grammar_exercises` (nếu cần, làm PR rename riêng).

## Câu hỏi còn mở

- `quiz_questions` dạng `listening` — migrate sang mô hình `exercise_sets` hay để
  song song? (migration `20260731100000_quiz_questions_set_id.sql` đã gắn
  `set_id`, chưa rõ đã dùng thật hay còn để đó.)
