# Phase 5b (rút gọn) — Daily Progress Report — Spec

## Bối cảnh

Spec gốc (`requirement.md`) yêu cầu scheduled job + bảng snapshot
`daily_progress_reports` + so sánh "tiến độ thực tế" với "tiến độ kỳ
vọng" (dựa trên `level_started_at`, `planned_completion_date`,
`subscription_end_date`). DB hiện tại **không có** khái niệm gói/
subscription (`profiles` chỉ có `is_premium` boolean) — đã được xác nhận
bỏ hẳn phần kỳ vọng/trạng thái/gói còn lại, chỉ giữ **tiến độ thực tế**.

Vì không còn gì "theo thời gian" để so sánh, không cần bảng snapshot hay
scheduled job — tính **live** mỗi lần tải Dashboard, từ dữ liệu đã có sẵn
(`lesson_progress` qua `stats`/`modules` props hiện tại của
`DashboardPage.tsx`).

## Phát hiện quan trọng: phần lớn đã có sẵn

`DashboardPage.tsx` đã có card "Tiến độ cấp độ" + nút "Tiếp tục học" gần
như đúng yêu cầu — chỉ đang **hard-code cứng level A1**:

```tsx
const a1Module = modules.find(m => m.level === "A1");
const totalLessonsInA1 = a1Module?.lessons.length ?? 0;
const completedA1Lessons = a1Module?.lessons.filter(l => stats.completedLessons.includes(l.id)).length ?? 0;
```

→ luôn hiện tiến độ A1 dù học viên đang học A2/B1/B2. Spec này là 1
refactor nhỏ, không tạo bảng/Edge Function/cron mới.

## Thay đổi

1. **Level hiện tại** = level của `nextSuggestedLesson` (bài chưa hoàn
   thành đầu tiên toàn lộ trình — logic đã có, không đổi).
2. **Tổng/hoàn thành lesson của level hiện tại**: gộp **mọi module cùng
   level** (dùng `.filter().flatMap()` thay vì `.find()` — hiện tại mỗi
   level chỉ có đúng 1 module nên không đổi hành vi, nhưng đúng hơn nếu
   sau này có nhiều module/level).
3. **"Mục tiêu tiếp theo"**: hiện đang hard-code "khóa A2" — đổi thành
   level kế tiếp thực sự sau level hiện tại (`A1→A2→B1→B2`), ẩn dòng này
   nếu học viên đã ở level cuối (B2).
4. **Thêm dòng "Lesson hiện tại"**: hiện tên lesson (`nextSuggestedLesson.
   title`/`titleVi`) ngay trong card tiến độ — hiện chưa có, chỉ có nút
   bấm không kèm tên hiển thị tại đúng vị trí "Tổng quan" theo mock UI
   của requirement gốc (tên lesson đã hiện ở card "Bài học tiếp theo" bên
   cạnh — thêm lặp lại ngắn gọn trong card tiến độ cho đúng bố cục
   "Tổng quan" 1 chỗ theo spec, không xoá card "Bài học tiếp theo" hiện
   có).
5. Đổi tiêu đề card từ "Tiến độ cấp độ A1" (cứng) → "Tiến độ cấp độ
   {level}" (động).

## Không đổi

- Không tạo bảng `daily_progress_reports`.
- Không tạo scheduled job / Edge Function mới.
- Không đổi `stats`/`modules` props hay cách `DashboardPage` được gọi từ
  `App.tsx`.
- "Kế hoạch bài học nổi bật" (danh sách cứng, dữ liệu giả trang trí) —
  ngoài phạm vi, không đụng tới.
- Trạng thái "Đúng tiến độ/Cần chú ý/Chậm tiến độ" và "ngày còn lại của
  gói" — bỏ hẳn theo quyết định đã chốt.

## Testing

- Không có logic phức tạp mới cần tách hàm riêng — phép tính
  `completed/total` đã là pattern có sẵn trong file, chỉ đổi nguồn lọc.
  Không thêm unit test mới cho refactor JSX thuần này.
- Test tay: đăng nhập tài khoản đang học A2 (nếu có) hoặc set thủ công
  `completedLessons` qua A1 xong, xác nhận card hiện đúng "Tiến độ cấp độ
  A2", đúng lesson hiện tại, đúng "Mục tiêu tiếp theo là khóa B1".
