# Thêm tab "Nói" (Speaking) — nội dung Markdown giống Ngữ pháp then chốt

## Bối cảnh

Bài học hiện có 4 tab dưới cùng: Từ vựng / Bài tập ngữ pháp / Nghe / Đọc. Cần thêm 1 mục "Nói" — không phải bài tập chấm điểm (không cần trang riêng như Quiz/Nghe/Đọc), mà là nội dung tham khảo tĩnh giống hệt cách "Ngữ pháp then chốt" đang hoạt động: admin soạn bằng Markdown tự do, học viên xem trực tiếp trong tab, không có tương tác chấm điểm.

## Quyết định thiết kế đã chốt

- Nội dung là 1 cột Markdown tự do (`speaking_md`), y hệt cơ chế `grammar_md` hiện có — không có cấu trúc dữ liệu riêng (không phải danh sách câu như Từ vựng).
- Vị trí tab: **Từ vựng → Nói → Bài tập ngữ pháp → Nghe → Đọc**.
- Khi bài học chưa có nội dung Nói: hiện "Sắp có" giống Nghe/Đọc (nhất quán, không ẩn tab).
- Thêm nội dung mẫu cho bài `a1-l1` ngay trong migration, để demo/test được ngay (không để trống).
- Không cần trang riêng, không chấm điểm, không liên quan đến cơ chế `quiz_questions`/category.

## Thiết kế chi tiết

### 1. Migration

```sql
ALTER TABLE lessons ADD COLUMN speaking_md TEXT;

UPDATE lessons
SET speaking_md = '## Luyện nói: Giới thiệu bản thân

Hãy tập nói to các câu sau, dựa theo mẫu hội thoại đã học:

- **Chào hỏi**: "Guten Tag! Ich heiße [tên bạn]."
- **Giới thiệu quê quán**: "Ich komme aus Vietnam."
- **Hỏi lại người khác**: "Und du? Wie heißt du?"

### Gợi ý luyện tập
1. Nói to từng câu, chú ý phát âm chữ "ch" trong "ich".
2. Ghép các câu trên thành 1 đoạn giới thiệu bản thân hoàn chỉnh (3-4 câu).
3. Thử đổi tên/quê quán của bạn vào mẫu câu và nói lại.'
WHERE id = 'a1-l1';
```

(Đặt tên migration file theo đúng quy ước timestamp đã dùng trong `supabase/migrations/`, ví dụ `20260715000013_add_speaking_md.sql`.)

### 2. `src/lib/appTypes.ts`

Thêm `speakingMd?: string;` vào `Lesson` interface, cùng nhóm với `grammarMd?: string;`.

### 3. `src/lib/hooks/useModules.ts`

- Thêm `speaking_md` vào `SupabaseLesson` type và câu `select(...)`.
- Map: `speakingMd: l.speaking_md ?? undefined,`.

### 4. `src/pages/LessonDetailPage.tsx`

- `BottomTab` type thêm `"noi"`.
- `BOTTOM_TABS` chèn `{ id: "noi", label: "Nói", Icon: Mic }` vào vị trí thứ 2 (sau `tuvung`, trước `quiz`). Import `Mic` từ `lucide-react`.
- Thêm nhánh `{bottomTab === "noi" && (...)}` trong khu tab content: nếu `lesson.speakingMd` tồn tại → `<MarkdownBlock content={lesson.speakingMd} />`; nếu không → khối "Sắp có" theo đúng style/cấu trúc đã dùng cho Nghe/Đọc (icon `Mic`, text "Nội dung luyện nói cho bài học này đang được chuẩn bị.").

### 5. `src/pages/admin/AdminLessonEditor.tsx`

- `LessonEditable` thêm `speaking_md?: string | null;`.
- `handleSave`'s update payload thêm `speaking_md: data.speaking_md || null,`.
- Thêm 1 khối soạn thảo Markdown mới ngay sau khối "Ngữ pháp then chốt" hiện có, cấu trúc y hệt (badge tiêu đề, toggle Chỉnh sửa/Xem trước, textarea markdown, preview bằng `MarkdownBlock`) — chỉ đổi label thành "Nói" và field tương ứng `speaking_md`. Dùng 1 state tab riêng (không dùng chung `grammarTab` của khối Ngữ pháp) để 2 khối độc lập nhau.

## Ngoài phạm vi

- Không thêm bài tập chấm điểm cho "Nói" (không liên quan `quiz_questions`/category).
- Không thêm ghi âm/nhận diện giọng nói — chỉ là nội dung tham khảo tĩnh.
- Không đổi cơ chế Nghe/Đọc/Ngữ pháp hiện có.

## Testing / verification

- `npm run lint` pass.
- Test browser thủ công:
  - Bài có `speakingMd`: tab "Nói" hiện đúng nội dung markdown đã soạn.
  - Bài không có `speakingMd`: hiện "Sắp có".
  - Thứ tự tab đúng: Từ vựng / Nói / Bài tập ngữ pháp / Nghe / Đọc.
  - Admin: soạn/sửa nội dung Nói qua khối markdown mới, lưu thành công, xem lại đúng nội dung.
- Xác nhận bài `a1-l1` sau migration hiển thị đúng nội dung mẫu ở tab Nói.
