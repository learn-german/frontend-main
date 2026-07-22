# Thêm ảnh vào Giải thích video (Ngữ pháp then chốt)

## Bối cảnh

"Giải thích video" trong yêu cầu ứng với tab **Ngữ pháp then chốt** của bài học — nội dung markdown lưu ở field `grammar_md` (cột `lessons.grammar_md`), soạn tại [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx) và hiển thị cho học viên tại tab "Ngữ pháp then chốt" trong [LessonDetailPage.tsx](../../../src/pages/LessonDetailPage.tsx).

`MarkdownBlock` đã hỗ trợ render `<img>` từ cú pháp `![alt](url)` nên phần hiển thị cơ bản đã có sẵn; việc còn thiếu là (1) nơi lưu trữ ảnh, (2) cơ chế nhúng ảnh **riêng tư** (không phải URL public vĩnh viễn — theo đúng cách video/audio hiện dùng) vào text markdown, và (3) UI upload ảnh cho Admin.

## Quyết định thiết kế

- **Phân quyền**: dùng chung gate admin hiện có (`app_metadata.role === "admin"`). Không tạo role `content_manager` riêng — ngoài phạm vi tính năng này.
- **Không tạo cấu trúc ảnh riêng** (không thêm cột `grammar_images`). Ảnh được nhúng ngay trong `grammar_md` bằng markdown, giữ đúng thứ tự xen kẽ với chữ — tận dụng toàn bộ UI Chỉnh sửa/Xem trước đã có cho 4 field markdown khác trong editor.
- **Ảnh lưu private trên Cloudflare R2**, dùng chung hạ tầng với video/audio (không dùng bucket/URL public), vì nội dung bài học được coi là tài nguyên cần đăng nhập mới xem được — giống hệt cách video hoạt động.
- **Sửa/xóa ảnh**: admin tự sửa hoặc xóa dòng `![](r2img:...)` trực tiếp trong textarea, không có nút quản lý ảnh riêng — nhất quán với cách các field markdown khác trong editor này hoạt động (không có UI đặc biệt, tất cả là sửa text thô).

## Kiến trúc

### 1. Lưu trữ & cấp phát URL (Cloudflare R2)

Vì `grammar_md` là text tự do có thể chứa nhiều ảnh ở nhiều vị trí (khác với video — 1 cột `video_r2_key` cố định), không thể lưu thẳng signed URL vào text (sẽ hết hạn). Thay vào đó lưu **object key** qua một scheme riêng trong markdown, resolve thành signed URL tại thời điểm render.

**`api/media/upload-url.ts`** (mở rộng):
- Thêm `"image"` vào union `MediaType`.
- `ALLOWED_EXT.image = ["jpg", "jpeg", "png", "webp"]`.
- Object key: server tự sinh random id (`crypto.randomUUID()`), **không** tin id từ client — `images/{lessonId}/{randomId}.{ext}`. Khác với video (key cố định theo lessonId, ghi đè khi upload lại) vì 1 bài học có thể có nhiều ảnh.
- Quyền: giữ nguyên check `role === "admin"` đã có.

**`api/media/playback-url.ts`** (mở rộng):
- Thêm nhánh `type === "image"`, nhận thêm query `objectKey`.
- Validate `objectKey` bắt đầu đúng bằng `images/{lessonId}/` (lessonId lấy từ query, khớp lesson đang xem) — tránh dùng key tùy ý ngoài phạm vi lesson.
- Trả `{ url }` là signed GET URL, hết hạn sau 4h (`expiresIn: 14400`, giống video/audio hiện tại).
- Quyền: giữ nguyên — chỉ cần user đã đăng nhập (không cần thêm ràng buộc enrollment, khớp hành vi hiện tại của video/audio).

### 2. Scheme nhúng ảnh trong markdown

Trong `grammar_md`, ảnh được nhúng dạng:

```
![](r2img:images/{lessonId}/{randomId}.jpg)
```

**`src/components/MarkdownBlock.tsx`**:
- Thêm component `R2Image` — khi `img` renderer gặp `src` bắt đầu bằng `r2img:`, tách lấy object key, gọi `/api/media/playback-url?type=image&lessonId=...&objectKey=...` (kèm bearer token từ session) để lấy signed URL, rồi render `<img src={signedUrl}>`.
  - Trạng thái loading: khung xám nhỏ (skeleton) trong lúc chờ.
  - Trạng thái lỗi (fetch fail, hết session...): hiện placeholder nhỏ "Không tải được ảnh", không throw, không vỡ layout.
- `urlTransform` hiện tại (dòng 111-113) sanitize URL qua `defaultUrlTransform`, chỉ cho phép http/https/mailto/tel/relative — cần thêm ngoại lệ cho scheme `r2img:` giống cách đã làm với `pronounce:`.
- `MarkdownBlock` nhận thêm prop optional `lessonId: string` — bắt buộc phải truyền khi content có thể chứa ảnh (cả 2 nơi render `grammar_md`: preview trong Admin editor và tab học viên).

### 3. UI Admin — upload ảnh

Tại khối "Ngữ pháp then chốt" trong `AdminLessonEditor.tsx`:

- **Nút "Thêm ảnh"**: đặt cạnh toggle Chỉnh sửa/Xem trước hiện có, style giống nút "Tải video lên" đã có (input file ẩn, `accept="image/jpeg,image/png,image/webp"`).
- **Dán ảnh trực tiếp**: `onPaste` trên textarea — nếu `clipboardData.items` chứa ảnh, `preventDefault()`, lấy `File` và chạy chung luồng upload bên dưới.
- **Luồng upload dùng chung** (nút hoặc paste):
  1. Validate client-side: đúng jpg/png/webp, ≤ 5MB. Sai → `showToast(msg, "warning")`, dừng lại, không đổi `data.grammar_md`.
  2. Gọi upload (mở rộng `uploadMedia` hoặc hàm tương tự) với `mediaType: "image"` → nhận `objectKey`.
  3. Chèn `![](r2img:{objectKey})` vào textarea tại đúng vị trí con trỏ hiện tại (`selectionStart`/`selectionEnd` qua ref), không ghi đè nội dung đã gõ.
  4. Tự động chuyển `grammarTab` sang `"preview"` để admin thấy ảnh hiển thị ngay trong nội dung.
  5. Lỗi mạng/upload → toast lỗi, giữ nguyên nội dung hiện có.

### 4. Hiển thị cho học viên

- `LessonDetailPage.tsx` truyền thêm `lessonId={lesson.id}` vào `<MarkdownBlock>` ở tab Ngữ pháp then chốt.
- Style ảnh sẵn có (`rounded-lg max-w-full my-1`) đã tự co giãn responsive — không cần chỉnh thêm cho mobile/tablet/desktop.
- Nội dung cũ chỉ có chữ (không chứa `r2img:`) không bị ảnh hưởng — `R2Image` chỉ kích hoạt khi gặp đúng scheme.

## Edge cases

| Tình huống | Xử lý |
|---|---|
| Sai định dạng / > 5MB | Toast lỗi, không upload, không đổi nội dung |
| Lỗi mạng lúc upload | Toast lỗi, textarea giữ nguyên |
| `R2Image` fetch signed URL lỗi | Placeholder "Không tải được ảnh", không vỡ layout |
| Signed URL hết hạn (4h) | Không ảnh hưởng — `R2Image` fetch lại mỗi lần mount trang |
| Nội dung cũ chỉ có chữ | Hiển thị/sửa bình thường, không đổi hành vi |

## Việc cần làm trước khi merge (hạ tầng)

Không cần thao tác thêm trên Cloudflare — bucket R2 hiện tại đã private, dùng nguyên cấu hình đang có cho video/audio (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`). Không cần biến môi trường mới.

## Ngoài phạm vi

- Không áp dụng cho các field markdown khác (`speaking_md`, `writing_prompt_md`, `vocabulary_md`) — chỉ `grammar_md`.
- Không xây dựng role `content_manager` mới.
- Không có UI quản lý/reorder ảnh riêng — sửa trực tiếp trong markdown.
