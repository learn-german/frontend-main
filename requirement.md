[Grammar Exercise] Pass 80%, mở lời giải khi đúng hết hoặc đến lần 5
## Mục tiêu

Xây dựng luồng làm bài tập **Ngữ pháp, Nghe và Đọc** theo từng video.

Mỗi video có nhiều bài tập; mỗi bài tập có nhiều câu hỏi. Học viên phải hoàn thành và đạt từng bài tập trước khi chuyển sang bài tập tiếp theo.

## Phạm vi áp dụng

- Áp dụng cho **bài tập Ngữ pháp, Nghe và Đọc**.
- Kết quả, số lần làm và trạng thái pass được quản lý riêng theo từng

## User flow

1. Học viên mở bài tập Ngữ pháp đầu tiên của video.
2. Hệ thống hiển thị các câu hỏi nhưng không trả đáp án đúng hoặc phần giải thích cho frontend.
3. Học viên trả lời tất cả câu hỏi và nhấn **Nộp bài**.
4. Mỗi một lần nộp bài sẽ tính là 1 lần attempt_number và khi làm lại, sẽ tăng `attempt_number` của bài tập.
5. Hệ thống hiển thị:
    - câu nào học viên trả lời đúng;
    - câu nào học viên trả lời sai;
    - số câu đúng trên tổng số câu;
    - tỷ lệ đúng;
    - trạng thái **Đạt** hoặc **Chưa đạt**.
6. Trước khi đủ điều kiện mở lời giải, hệ thống không hiển thị đáp án đúng và không hiển thị phần giải thích.
7. Nếu tỷ lệ đúng từ **80% trở lên**, bài tập được tính là **Pass** và hiển thị nút **Tiếp tục** để chuyển sang bài tập tiếp theo trong cùng video.
8. Nếu tỷ lệ đúng dưới **80%**, bài tập ở trạng thái **Chưa đạt** và học viên phải chọn **Làm lại** bài tập hiện tại.
9. Đáp án đúng và phần giải thích chỉ được hiển thị khi:
    - học viên trả lời đúng toàn bộ câu hỏi; hoặc
    - học viên đã nộp bài đến lần thứ 5.
10. Nếu lần thứ 5 vẫn dưới 80%, hệ thống mở đáp án đúng và phần giải thích nhưng bài tập vẫn chưa được tính là Pass. Học viên tiếp tục làm lại đến khi đạt từ 80% trở lên.

## Business rules

### BR-01 — Cấu trúc bài tập

- Một video có thể có nhiều bài tập Ngữ pháp.
- Một bài tập có thể có nhiều câu hỏi.
- Bài tập hiển thị theo thứ tự đã cấu hình trong video (`order_index`), nhưng
  **không khoá tuần tự** — học viên có thể mở và làm bất kỳ bài tập nào
  trong video, không bắt buộc Pass bài trước mới mở được bài sau. Quyết định
  sản phẩm (2026-08-05), khác với bản nháp ban đầu của mục này.

### BR-02 — Cách tính điểm và Pass

```
scorePercentage = correctCount / totalQuestions × 100
isPassed = scorePercentage >= 80
```

Để tránh sai số làm tròn, backend nên kiểm tra trực tiếp:

```
correctCount × 100 >= totalQuestions × 80
```

Ví dụ:

- `4/5 = 80%` → Pass.
- `7/9 ≈ 77.78%` → Chưa đạt.
- Không được làm tròn `77.78%` thành `80%` để tính Pass.

### BR-06 — Quản lý số lần làm

- `attempt_number` được tính riêng theo từng `user_id + exercise_id`.
- Chỉ tăng số lần làm khi backend chấm và lưu kết quả thành công.
- Không tăng số lần khi:
    - học viên reload trang;
    - request submit bị validation fail;
    - request lỗi trước khi transaction được commit;
    - frontend gửi lại cùng một `submissionId` do double-click hoặc retry.

## Acceptance Criteria

- [ ]  Tính năng áp dụng thống nhất cho bài tập Ngữ pháp
- [ ]  Mỗi video có thể chứa nhiều bài tập và mỗi bài tập có thể chứa nhiều câu hỏi.
- [ ]  Sau mỗi lần submit, hệ thống hiển thị đúng/sai của từng câu.
- [ ]  Trước khi đúng toàn bộ hoặc đến lần thứ 5, API không trả đáp án đúng hoặc phần giải thích.
- [ ]  Đúng toàn bộ ở bất kỳ lần nào sẽ mở ngay toàn bộ đáp án đúng và giải thích.
- [ ]  Từ lần thứ 5, hệ thống mở đáp án đúng và giải thích dù vẫn còn câu sai.
- [ ]  Bài tập được Pass khi số câu đúng đạt từ 80% tổng số câu trở lên.
- [ ]  Bài tập từ 80% trở lên hiển thị nút **Tiếp tục**. (Không khoá bài tập
      tiếp theo khi chưa Pass — xem BR-01, quyết định sản phẩm 2026-08-05.)
- [ ]  Lần thứ 5 không tự động Pass nếu tỷ lệ đúng vẫn dưới 80%.
- [ ]  Sau lần thứ 5, học viên vẫn có thể làm lại cho đến khi Pass.
- [ ]  Attempt được tính riêng theo từng user và từng bài tập.
- [ ]  Reload, submit lỗi hoặc gửi trùng `submissionId` không làm tăng attempt.
- [ ]  Trạng thái đã mở lời giải được giữ khi reload hoặc làm lại.

## Test cases chính

| Trường hợp | Kết quả mong đợi |
| --- | --- |
| Lần 1, đúng 3/5 | 60%, chưa Pass, chỉ hiển thị đúng/sai, cho Làm lại |
| Lần 1, đúng 4/5 | 80%, Pass, không mở lời giải, cho Tiếp tục |
| Lần 1, đúng 5/5 | 100%, Pass, mở đáp án và giải thích, cho Tiếp tục |
| Lần 4, đúng 4/5 | 80%, Pass, không mở lời giải, cho Tiếp tục |
| Lần 5, đúng 3/5 | 60%, chưa Pass, mở đáp án và giải thích, không cho Tiếp tục |
| Lần 6, đúng 4/5 | 80%, Pass, lời giải vẫn được mở, cho Tiếp tục |

## Out of scope

- Thay đổi nội dung câu hỏi, đáp án hoặc giải thích do Admin tạo.
- Tính điểm chung cho toàn bộ video.
- Cho phép bỏ qua bài tập chưa Pass.
---
[Report] Thêm tính năng tạo Daily Progress Report
## Mục tiêu

Thêm tính năng tự động tạo **Daily Progress Report** cho từng học viên, nhằm hiển thị tình trạng học tập mới nhất trong ngày và giúp học viên biết mình đang ở đâu trong lộ trình, có đang chậm tiến độ hay không và cần tiếp tục từ lesson nào.

## User flow

1. Scheduled job chạy một lần mỗi ngày theo timezone được cấu hình của hệ thống.
2. Hệ thống lấy danh sách học viên có package/subscription đang active và có level đang học.
3. Với từng học viên, hệ thống lấy level hiện tại, current lesson, số lesson bắt buộc đã hoàn thành, tổng số lesson bắt buộc, ngày bắt đầu level, ngày dự kiến hoàn thành level và ngày hết hạn gói.
4. Hệ thống kiểm tra dữ liệu đầu vào trước khi tính report.
5. Hệ thống tính tiến độ thực tế, tiến độ kỳ vọng, mức chênh lệch tiến độ và số ngày còn lại của gói.
6. Hệ thống xác định trạng thái: `Đúng tiến độ`, `Cần chú ý` hoặc `Chậm tiến độ`.
7. Hệ thống upsert Daily Progress Report của ngày hiện tại, không tạo bản ghi trùng.
8. Khi học viên hoàn thành lesson hoặc dữ liệu package/current lesson thay đổi trong ngày, hệ thống cập nhật lại report của ngày hiện tại.
9. Learning Dashboard gọi API lấy report mới nhất và hiển thị phần Tổng quan.
10. Khi học viên chọn `Tiếp tục học`, hệ thống mở đúng current lesson.

## Thông tin hiển thị trên Daily Report

### Tổng quan

- Ngày tạo báo cáo.
- Level hiện tại, ví dụ: `A1`.
- Lesson hiện tại, ví dụ: `Video 7 — Phủ định nicht và kein`.
- Tiến độ level hiện tại, ví dụ: `Tiến độ A1: 38%`.
- Số lesson đã hoàn thành trên tổng số lesson bắt buộc, ví dụ: `8/21`.
- Thời gian còn lại của gói, ví dụ: `42 ngày`.
- Trạng thái tiến độ: `Đúng tiến độ`, `Cần chú ý` hoặc `Chậm tiến độ`.
- Chênh lệch giữa tiến độ kỳ vọng và tiến độ thực tế.
- Thông báo giải thích trạng thái, ví dụ: `Bạn đang thấp hơn kế hoạch khoảng 7 điểm phần trăm`.
- Button `Tiếp tục học`.

### Ví dụ UI

```
TỔNG QUAN

Level hiện tại: A1
Lesson hiện tại: Video 7 — Phủ định nicht và kein
Tiến độ A1: 38%
Lesson hoàn thành: 8/21
Thời gian còn lại của gói: 42 ngày

Trạng thái: Cần chú ý
Bạn đang thấp hơn kế hoạch khoảng 7 điểm phần trăm.

[Tiếp tục học]
```

## Business rules

- Chỉ tạo report cho học viên có level đang học và package/subscription active.
- Mỗi học viên chỉ có một report cho một ngày và một level.
- `Tiến độ thực tế` chỉ tính trên lesson bắt buộc đã hoàn thành.
- Schreiben và Sprechen là bài tập gợi ý, không ảnh hưởng trực tiếp đến tiến độ level.
- Khi hiển thị mức chậm, dùng thuật ngữ `điểm phần trăm`.

## Công thức tính

```
actual_progress =
completed_required_lessons / total_required_lessons × 100%

expected_progress =
elapsed_days_from_level_start / planned_level_days × 100%

Trong đó:
- `elapsed_days_from_level_start = report_date - level_started_at`.
- `planned_level_days = planned_completion_date - level_started_at`.
- Không dùng ngày đăng ký tài khoản để tính tiến độ kỳ vọng.

progress_gap =
expected_progress - actual_progress

remaining_package_days =
max(subscription_end_date - report_date, 0)
```

Quy tắc bổ sung:

- `actual_progress` và `expected_progress` được giới hạn trong khoảng `0–100%`.
- Phép tính lưu độ chính xác đầy đủ; UI làm tròn tiến độ và chênh lệch đến số nguyên gần nhất.
- Nếu `planned_level_days <= 0` hoặc thiếu `level_started_at/planned_completion_date`, hệ thống không tính trạng thái mà trả về trạng thái dữ liệu `insufficient_data`.
- Nếu `progress_gap <= 0`, trạng thái là `Đúng tiến độ`; thông báo có thể hiển thị học viên đang đúng hoặc đi trước kế hoạch.
- Report của ngày hiện tại có thể được cập nhật; report của các ngày trước là snapshot và không tự thay đổi.

## Rule xác định trạng thái

- `Đúng tiến độ`: `progress_gap < 5` điểm phần trăm, bao gồm trường hợp học viên đi trước kế hoạch.
- `Cần chú ý`: `5 <= progress_gap < 10` điểm phần trăm.
- `Chậm tiến độ`: `progress_gap >= 10` điểm phần trăm.
- Nếu không đủ dữ liệu để tính `expected_progress`, không gán một trong ba trạng thái trên; UI hiển thị `Chưa đủ dữ liệu để đánh giá tiến độ`.
- Các ngưỡng phải cấu hình được theo level hoặc package.
- Số lần làm lại bài tập không tự động dùng để xác định chậm tiến độ; dữ liệu này dùng cho phần gợi ý ôn tập.

## Technical scope

### Frontend

- Thêm component `DailyProgressReportCard` trên Learning Dashboard.
- Gọi API lấy report mới nhất của học viên đang đăng nhập.
- Hiển thị các trạng thái: loading, success, insufficient data, empty, error và package expired.
- Progress bar hiển thị đúng `actual_progress_percentage`.
- Button `Tiếp tục học` điều hướng tới `current_lesson_id`.
- Không tự tính lại business rule ở frontend; frontend dùng dữ liệu do backend trả về.

### Backend

- Tạo scheduled job sinh report hàng ngày.
- Tạo service tính `actual_progress`, `expected_progress`, `progress_gap`, `progress_status` và `package_remaining_days`.
- Upsert report theo khóa duy nhất `user_id + level_id + report_date`.
- Cập nhật report của ngày hiện tại khi lesson/package/current lesson thay đổi.
- Kiểm tra quyền khi user xem report và khi admin regenerate report.
- Ghi log khi job thất bại hoặc không thể tạo report do dữ liệu không hợp lệ.

### Database

Tạo bảng `daily_progress_reports` gồm tối thiểu:

- `id`
- `user_id`
- `level_id`
- `current_lesson_id`
- `report_date`
- `completed_required_lessons`
- `total_required_lessons`
- `actual_progress_percentage`
- `expected_progress_percentage`
- `progress_gap_percentage_point`
- `progress_status`
- `package_remaining_days`
- `generation_status`
- `error_message`
- `generated_at`
- `updated_at`

Ràng buộc:

- Unique index: `user_id + level_id + report_date`.
- Index phục vụ truy vấn lịch sử: `user_id + report_date`.
- Các report trước ngày hiện tại được coi là snapshot lịch sử.

## API đề xuất

### Lấy report mới nhất

`GET /api/user/reports/daily/latest`

Response thành công:

```json
{
  "reportDate": "2026-07-24",
  "level": "A1",
  "currentLesson": {
    "id": "LESSON-007",
    "title": "Video 7 — Phủ định nicht và kein"
  },
  "completedLessons": 8,
  "totalLessons": 21,
  "actualProgressPercentage": 38,
  "expectedProgressPercentage": 45,
  "progressGapPercentagePoint": 7,
  "progressStatus": "ATTENTION",
  "packageRemainingDays": 42,
  "message": "Bạn đang thấp hơn kế hoạch khoảng 7 điểm phần trăm."
}
```

### Xem lịch sử report

`GET /api/user/reports/daily?from={date}&to={date}`

### Admin tạo lại report

`POST /api/admin/users/{userId}/reports/daily/regenerate`

### Error cases

- `400`: Thiếu hoặc sai dữ liệu ngày bắt đầu/ngày dự kiến hoàn thành level.
- `401`: User chưa đăng nhập.
- `403`: Không có quyền xem hoặc regenerate report.
- `404`: Không tìm thấy level/package/current lesson phù hợp.
- `409`: Không tạo bản ghi mới khi report ngày hiện tại đã tồn tại; hệ thống phải upsert.
- `500`: Job hoặc service tạo report gặp lỗi hệ thống.

## Acceptance Criteria

- [ ]  Hệ thống tự động chạy job tạo Daily Progress Report mỗi ngày.
- [ ]  Chỉ user có package active và level đang học được tạo report.
- [ ]  Mỗi user chỉ có một report cho một ngày và một level.
- [ ]  Report hiển thị đúng current level và current lesson.
- [ ]  Tiến độ thực tế được tính đúng từ số lesson bắt buộc đã hoàn thành.
- [ ]  Tiến độ kỳ vọng được tính đúng theo thời gian đã trôi qua trong kế hoạch học.
- [ ]  Mức chậm tiến độ được tính bằng tiến độ kỳ vọng trừ tiến độ thực tế.
- [ ]  Trạng thái được xác định đúng theo ngưỡng cấu hình.
- [ ]  Thời gian còn lại của gói được tính đúng theo ngày hết hạn subscription.
- [ ]  Button `Tiếp tục học` mở đúng current lesson.
- [ ]  Report của ngày hiện tại được cập nhật khi học viên hoàn thành lesson hoặc current lesson/package thay đổi.
- [ ]  Report của các ngày trước không thay đổi khi tiến độ hiện tại thay đổi.
- [ ]  Không sử dụng ngày đăng ký tài khoản để tính tiến độ kỳ vọng.
- [ ]  Không xảy ra lỗi chia cho 0 khi thiếu hoặc sai ngày kế hoạch.
- [ ]  `package_remaining_days` không trả về số âm.
- [ ]  UI hiển thị đúng các trạng thái loading, success, insufficient data, empty và error.
- [ ]  User chỉ xem được report của chính mình; admin có quyền phù hợp mới được regenerate.
- [ ]  Job lỗi phải có log và lưu `generation_status = failed` khi phù hợp.

## Out of scope

- Gửi Daily Report qua email hoặc push notification.
- Báo cáo tuần/tháng và biểu đồ xu hướng dài hạn.
- AI tự động phân tích nguyên nhân học chậm.
- Gợi ý ôn tập chi tiết theo số lần làm sai bài tập.
- Thay đổi quy tắc hoàn thành lesson hiện tại.

## Definition of Done

- [ ]  Hoàn thành migration cho `daily_progress_reports`.
- [ ]  Hoàn thành scheduled job, service tính report và các API liên quan.
- [ ]  Hoàn thành component Daily Progress Report trên Learning Dashboard.
- [ ]  Có unit test cho công thức và rule trạng thái ở các giá trị biên `5` và `10` điểm phần trăm.
- [ ]  Có integration test cho upsert report và unique constraint.
- [ ]  Có test cho trường hợp thiếu ngày kế hoạch, package hết hạn và không có current lesson.
- [ ]  Code review hoàn thành.
- [ ]  Deploy lên môi trường test.
- [ ]  QA test pass và không còn bug Critical/High liên quan.
---
Áp dụng toàn bộ kiểu câu hỏi từ phần ngữ pháp sang cho nghe và đọc 
giữ nguyên logic như phần ngữ pháp

Chia 3 phase độc lập, xem spec:
- [x] Phase 1 — nhập bài làm: [2026-08-05-shared-exercise-answer-input-design.md](docs/superpowers/specs/2026-08-05-shared-exercise-answer-input-design.md). Đã xong: `ExerciseAnswerInput` dùng chung, `grammarAnswerCodec` phủ đủ 10 loại, nghe/đọc nhập được đủ 10 loại (miễn Admin tạo được dữ liệu — chưa có UI, xem Phase 3). Ngữ pháp không đổi hành vi (122/122 test pass, lint sạch) — **chưa verify được trên trình duyệt thật** (sandbox không có `.env.local`), cần tự test theo Task 6 trong [plan](docs/superpowers/plans/2026-08-05-shared-exercise-answer-input.md).
- [ ] Phase 2 — hiển thị đúng/sai sau khi nộp bài cho 7 loại mới ở nghe/đọc. Chưa làm.
- [ ] Phase 3 — form Admin tạo/sửa 7 loại câu hỏi mới cho nghe/đọc, dùng chung field-rendering với `AdminGrammarExerciseSection.tsx`. Chưa làm.