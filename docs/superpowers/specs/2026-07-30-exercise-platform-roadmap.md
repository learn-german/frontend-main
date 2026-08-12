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
- **Xoá dạng bài "text_fill_blank"** (nhãn UI "Điền vào chỗ trống", markup
  `{{đáp_án}}` — khác `fill_in_the_blank`/"Điền vào ô trống" dùng `___` + word
  bank). Xong (2026-08-12) — xác nhận 0 exercise/attempt thật trước khi xoá, gỡ
  sạch khỏi TS union, admin form, answer codec, scoring, CHECK constraint DB,
  bỏ luôn regex che `prompt_text` trong view `grammar_exercises_public` (hết tác
  dụng). 164/164 test pass.

## Đã quyết định không làm (ghi lại để tránh làm lại)

Không còn hạng mục "chưa làm" nào tính đến 2026-08-12 — cả hai mục dưới đây đã
bị bỏ, không phải việc còn tồn đọng.

### Daily Progress Report — Phase B (frontend)

**Bị bỏ theo quyết định 2026-08-12** (ghi lại để không ai vô tình làm lại). Phase
A (backend) vẫn giữ nguyên, chạy được độc lập — chỉ không xây UI
`useDailyProgressReport`/`DailyProgressReportCard` trên Learning Dashboard nữa.

### Phase 5a — Nền gói cước / kế hoạch level

**Bị bỏ theo quyết định product owner** (ghi lại để không ai vô tình làm lại).
Daily Progress Report chạy ở chế độ rút gọn, thiếu `expected_progress`,
`progress_gap`, `package_remaining_days` — trả `insufficient_data` cho các trường
đó.

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
