# Learning progress formula implementation plan

**Goal:** áp dụng công thức trong spec cho kế hoạch ban đầu/gia hạn và tạo PR.
**Spec:** ../specs/2026-11-06-learning-progress-formula.md
**Architecture:** giữ API gap hiện có; snapshot kế hoạch qua trigger, Edge Function đọc snapshot để tính báo cáo. Không thêm dependency runtime.

- [x] Test công thức với hai ví dụ 23/15/45/10/18 và 30/10/60/15/14, ngày Việt Nam, biên ngày và dữ liệu sai; chạy RED rồi sửa report.ts.
- [x] Migration level_learning_plans: snapshot phạm vi/C0 khi enrollment thay đổi, tạo kế hoạch mới khi gia hạn subscription, RLS own-read/service write; kiểm tra SQL trên PostgreSQL tạm và lưu test SQL.
- [x] Handler đọc kế hoạch cố định, không auto sửa t0 sau khi đã chốt, kiểm tra handler fixtures và hợp đồng cũ. Admin hiển thị actual/expected/Delta.
- [x] Chạy test suite, TypeScript, build, GitNexus detect_changes; review độc lập và sửa hai findings (enrollment thiếu, FK bài đã xóa). Sửa thêm sai số floating point khiến ví dụ thiếu 1 bài bị làm tròn thành 2.

Kết quả: 350 frontend tests + 59 Edge Function tests pass; TypeScript/build pass. Migration chạy qua SQL assertions bằng PGlite với prerequisite schema tối thiểu; chưa chạy full Supabase pgTAP hoặc browser E2E. Build còn cảnh báo bundle size hiện có. Bước bàn giao: commit/push branch `codex/learning-progress-formula` và tạo PR, không merge/deploy.

Review focus: gia hạn nhiều lần trong ngày; snapshot không drift khi thêm bài; lỗi nguồn không được báo complete; timestamp qua nửa đêm Việt Nam; không đánh giá ngày trước t0 bằng kế hoạch mới.
