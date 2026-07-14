# Thiết kế lại layout trang bài học (LessonDetailPage)

## Bối cảnh

Layout hiện tại của [LessonDetailPage.tsx](../../../src/pages/LessonDetailPage.tsx) chia 2 khu vực:
- **Main Grid** (`grid-cols-1 lg:grid-cols-12`): cột trái (8/12) chứa Video + Ngữ pháp then chốt; cột phải (4/12) chứa Mục tiêu bài học + Từ vựng then chốt.
- **Bottom tabbed section**: 3 tab Quiz / Nghe / Đọc, nằm tách biệt hoàn toàn phía dưới Main Grid.

Vấn đề đã xác nhận qua test browser thực tế (2 breakpoint 1280px và 375px):
- Trên màn hình hẹp (dưới 1024px), grid tự chuyển về 1 cột dọc — Từ vựng then chốt (vốn ở cột phải) bị đẩy xuống nằm ngay trước khối Quiz/Nghe/Đọc, tạo cảm giác nó "ngang hàng"/cùng nhóm với phần luyện tập, dù về ý nghĩa nó là nội dung học, không phải bài tập.

Yêu cầu: thiết kế lại theo hướng đã xác nhận qua mockup (visual companion), giữ browser test breakpoint hiện tại làm cơ sở đánh giá.

## Thiết kế đã duyệt (qua mockup)

1. **Video + Mục tiêu bài học ngang hàng nhau** — 1 hàng grid, Video chiếm 8/12, Mục tiêu bài học chiếm 4/12 (giữ đúng tỷ lệ 2:1 hiện có).
2. **Ngữ pháp then chốt chiếm toàn bộ chiều ngang** (12/12) — nằm ở hàng riêng, ngay dưới hàng Video/Mục tiêu, không còn chia cột với gì cả (thay thế không gian mà Từ vựng từng chiếm ở cột phải).
3. **Từ vựng then chốt chuyển thành 1 tab mới**, ngang hàng với Quiz / Nghe / Đọc trong Bottom tabbed section (4 tab: Quiz / Nghe / Đọc / Từ vựng).
4. **Không để khoảng trống thừa**: card "Mục tiêu bài học" (nội dung ngắn) đặt cạnh Video (cao, theo `aspect-video`) — card Mục tiêu phải giãn đủ cao bằng Video (`h-full`) và bố trí nội dung dàn đều theo chiều dọc (`flex flex-col justify-between`) thay vì để trống 1 khoảng trắng ở cuối card.

## Thiết kế chi tiết

### 1. Main Grid — đổi từ "2 cột dọc" sang "2 hàng"

Cấu trúc JSX mới thay cho khối `{/* Main Grid — Left: Video + Grammar | Right: Objectives + Vocabulary */}` hiện tại:

```
{/* Row 1: Video + Mục tiêu bài học, ngang hàng */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <div className="lg:col-span-8">
    {/* Video section — y hệt nội dung hiện có */}
  </div>
  <div className="lg:col-span-4">
    {/* Objectives card — y hệt nội dung hiện có, thêm h-full flex flex-col justify-between */}
  </div>
</div>

{/* Row 2: Ngữ pháp then chốt, full width */}
<div>
  {/* Grammar block — y hệt nội dung hiện có (span, MarkdownBlock, fallback), không còn nằm trong cột 8/12 */}
</div>
```

- Video section (`<section>` chứa heading "Bài giảng lý thuyết" + `<VideoPlayer>`) giữ nguyên y hệt nội dung/props hiện tại, chỉ đổi cha bao ngoài.
- Objectives card giữ nguyên nội dung (`Mục tiêu bài học` + `objective` + divider + `Tóm tắt`), thêm class `h-full flex flex-col justify-between` để lấp đầy chiều cao bằng Video, tránh khoảng trắng cứng ở cuối card khi nội dung ngắn.
- Grammar block (span "Ngữ pháp then chốt" + `MarkdownBlock`/fallback) giữ nguyên y hệt nội dung, chỉ bỏ khỏi cột 8/12, đặt full-width ở hàng riêng ngay dưới Row 1.

### 2. Bottom tabbed section — thêm tab "Từ vựng"

`BOTTOM_TABS` hiện có 3 phần tử (`quiz`, `nghe`, `doc`) — thêm phần tử thứ 4 `tuvung` vào **cuối danh sách** (đúng thứ tự đã duyệt trong mockup: Quiz, Nghe, Đọc, Từ vựng), dùng icon `BookOpen` (đã import sẵn trong file, hiện dùng cho heading "Từ vựng then chốt" cũ).

Nội dung tab "Từ vựng" lấy nguyên y hệt nội dung `<section>` "Từ vựng then chốt" hiện có (header nhỏ icon+tên+đếm số từ, list từ vựng với nút phát âm) — chỉ chuyển từ "cột phải Main Grid" sang "nội dung 1 tab trong Bottom section", theo đúng pattern hiển thị header nội bộ mà tab Nghe/Đọc đang dùng (mỗi tab tự lặp lại 1 dòng header nhỏ dù tên tab đã hiển thị ở tab bar).

`BottomTab` type đổi từ `"quiz" | "nghe" | "doc"` thành `"quiz" | "nghe" | "doc" | "tuvung"`.

Tab mặc định khi mở trang giữ nguyên là `"quiz"` (không đổi hành vi mặc định hiện có).

### 3. Không đổi

- Không đổi `VideoPlayer`, `MarkdownBlock`, `useMediaPlaybackUrl` hay bất kỳ logic phát âm/hoàn thành bài học nào.
- Không đổi props/interface `LessonDetailPageProps`.
- Không đổi nội dung dữ liệu hiển thị (chỉ đổi vị trí/container).

## Testing / verification

- `npm run lint` pass.
- Test qua browser (đã có pattern harness từ buổi debug trước — mount `LessonDetailPage` với mock data, không cần đăng nhập):
  - Ở 1280px: xác nhận Video + Mục tiêu bài học ngang hàng, Mục tiêu bài học không bị "hụt" thấp hơn Video theo cách lộ khoảng trắng xấu; Ngữ pháp then chốt chiếm full chiều ngang; tab bar Bottom section có 4 tab, tab "Từ vựng" hiển thị đúng list từ vựng khi click.
  - Ở 375px: xác nhận Ngữ pháp then chốt và Bottom tabbed section (4 tab) vẫn đọc được, không còn tình huống Từ vựng kẹt giữa nội dung học và phần luyện tập (vì giờ nó chính thức là 1 tab, không phải 1 card lơ lửng).
  - Xác nhận tab "Từ vựng" hiển thị đúng khi lesson có nhiều/ít từ vựng (test với 0 từ, 1 từ, nhiều từ) — không vỡ layout.

## Ngoài phạm vi (không làm)

- Không đổi layout trang Admin (`AdminLessonEditor.tsx`) — yêu cầu chỉ áp dụng cho trang bài học phía người học.
- Không đổi cơ chế thêm/sửa từ vựng trong Admin.
- Không thêm animation/transition mới ngoài những gì đã có sẵn (`active-lesson-pulse`, `animate-in fade-in`...).
