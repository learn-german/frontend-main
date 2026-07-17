# Từ vựng dạng Markdown + click-to-speak, ẩn mp3 khỏi tab Nghe, thêm hướng dẫn cho Nghe/Đọc

## Bối cảnh

Bốn thay đổi UX cho `LessonDetailPage.tsx`:

1. Tab **Wortschatz** (Từ vựng) hiện render từ mảng cấu trúc `vocabulary: VocabularyItem[]` — chuyển sang soạn bằng Markdown tự do (`vocabularyMd`), giống pattern `grammarMd`/`speakingMd`/`writingPromptMd` đã có.
2. Trong nội dung Markdown đó, từ tiếng Đức bọc trong `{{...}}` được highlight và click để phát âm (Web Speech API, giống nút loa hiện tại).
3. Tab **Hören** (Nghe) trong trang chi tiết bài học hiện render danh sách `<ListeningClipPlayer>` (audio player mp3) — bỏ hẳn khỏi trang bài học; file mp3 chỉ phát khi học viên đang làm bài tập nghe (`QuizPage`, đã hoạt động độc lập).
4. Tab **Hören** và **Lesen** (Đọc) được bổ sung đoạn giới thiệu/hướng dẫn ngắn phía trên nút "Bắt đầu bài tập", giống đoạn text đang có ở tab Grammatikübungen.

## Quyết định thiết kế đã chốt

### 1. Vocabulary Markdown — thay thế hoàn toàn cấu trúc cũ

- Thêm cột `lessons.vocabulary_md TEXT` (migration mới, cùng convention với `grammar_md`).
- `appTypes.ts`: xoá `VocabularyItem` interface, đổi `Lesson.vocabulary: VocabularyItem[]` → `Lesson.vocabularyMd?: string`.
- `useModules.ts`: bỏ field `vocabulary` (unknown/JSONB) khỏi `SupabaseLesson` + query select, thêm `vocabulary_md: string | null` → map thành `vocabularyMd`.
- **Migrate dữ liệu có sẵn**: chạy 1 script/`execute_sql` một lần, đọc `vocabulary` JSONB hiện có của từng lesson, convert mỗi phần tử `{de, pronunciation, vi, exampleDe, exampleVi}` thành khối markdown, nối lại và `UPDATE lessons SET vocabulary_md = ...`. Định dạng mỗi từ:

  ```
  ### {{<de>}} — <vi>
  *<pronunciation>*

  🇩🇪 <exampleDe>
  🇻🇳 <exampleVi>
  ```

  Bỏ qua field rỗng (không in dòng `*<pronunciation>*` nếu pronunciation rỗng, tương tự cho ví dụ). Các khối cách nhau 1 dòng trống.
- Cột `lessons.vocabulary` (JSONB) **giữ nguyên trong DB**, không xoá, không migration DROP COLUMN — chỉ ngừng đọc/ghi từ code app. Lý do: tránh rollback nguy hiểm nếu convert markdown có sai sót, dữ liệu gốc vẫn còn để đối chiếu/sửa tay sau.

### 2. Admin editor (`AdminLessonEditor.tsx`)

- Bỏ toàn bộ UI edit từng ô vocabulary (de/pronunciation/vi/exampleDe/exampleVi) và các hàm `updVocab`/`addVocab`/`removeVocab`.
- Thay bằng 1 khối markdown editor (textarea + tab "Chỉnh sửa"/"Xem trước") đúng pattern khối "Nói"/"Viết" đã có, label "Từ vựng then chốt", đặt ở vị trí khối Vocabulary cũ. Placeholder ví dụ gợi ý cú pháp `{{...}}`:

  ```
  ### {{Guten Tag}} — Chào ngày mới / Xin chào
  *['gu:ten ta:k]*

  🇩🇪 Guten Tag, wie geht es Ihnen?
  🇻🇳 Xin chào, ông/bà khoẻ không?
  ```

- Ghi chú hướng dẫn cú pháp (giống dòng "Hỗ trợ Markdown: ..." đã có) bổ sung thêm: "Bọc từ cần luyện phát âm trong `{{...}}`, ví dụ `{{Guten Tag}}` — học viên click vào sẽ nghe phát âm."
- `AdminContentSection.tsx`: cập nhật `LESSON_SELECT` (bỏ `vocabulary`, thêm `vocabulary_md`), `LessonEditable` type thay `vocabulary: VocabItem[]` → `vocabulary_md?: string | null`, cập nhật `handleSave`/`handlePublish` trong editor để ghi `vocabulary_md` thay vì `vocabulary`.

### 3. Cú pháp `{{từ}}` → click để phát âm (`MarkdownBlock.tsx`)

- Thêm prop tuỳ chọn `onWordClick?: (word: string) => void` vào `MarkdownBlock`.
- Chỉ khi prop này được truyền, nội dung markdown mới qua bước tiền xử lý bổ sung: regex `\{\{([^{}]+)\}\}` → thay bằng cú pháp link `[<word>](pronounce:<encodeURIComponent(word)>)`.
- Custom component `a` (mở rộng component `a` hiện có): nếu `href` bắt đầu bằng `pronounce:`, render `<button type="button">` với style highlight (nền cam nhạt, giống tông màu nút loa hiện tại, có hover/active state) gọi `onWordClick(decodeURIComponent(word))` khi click, thay vì thẻ `<a>` điều hướng thật. Nếu không có `onWordClick`, giữ nguyên hành vi `a` gốc.
- Lý do dùng prop tuỳ chọn thay vì áp dụng biến đổi `{{...}}` cho mọi nội dung markdown: `grammarMd`/`speakingMd`/`writingPromptMd` không nên bị ảnh hưởng nếu admin vô tình gõ `{{` trong nội dung khác.

### 4. `LessonDetailPage.tsx` — tab Wortschatz

- `visibleTabs` filter: đổi điều kiện `tuvung` từ `lesson.vocabulary.length > 0` → `!!lesson.vocabularyMd`.
- Nội dung tab: nếu có `lesson.vocabularyMd`, render `<MarkdownBlock content={lesson.vocabularyMd} onWordClick={handlePronounce} />` (dùng lại hàm `handlePronounce` hiện có). Header giữ nguyên cấu trúc (icon + tiêu đề), đổi phụ đề từ "Click loa để nghe phát âm" → "Click từ được tô sáng để nghe phát âm". Badge "N từ" ở góc phải header đổi từ `lesson.vocabulary.length` sang đếm số lần khớp regex `/\{\{[^{}]+\}\}/g` trong `lesson.vocabularyMd` (cùng cách tính với counter ở `DashboardPage.tsx`, mục 7).

### 5. `LessonDetailPage.tsx` — tab Hören: bỏ audio player khỏi trang bài học

- Bỏ block render `{lesson.listeningClips.map(...) => <ListeningClipPlayer ... />}` khỏi tab `nghe`.
- Giữ nguyên điều kiện hiện/ẩn tab (`lesson.listeningClips.length > 0` — vẫn cần ít nhất 1 clip tồn tại để tab xuất hiện, dù không hiển thị player).
- `ListeningClipPlayer.tsx` sau thay đổi này không còn nơi nào import → xoá file (orphan do chính thay đổi này gây ra).
- `QuizPage.tsx` không đổi gì — luồng phát mp3 lúc làm bài tập nghe (qua `audioClipId` + `useMediaPlaybackUrl`) đã độc lập với trang bài học, tiếp tục hoạt động như cũ.

### 6. Thêm đoạn hướng dẫn cho tab Hören & Lesen

Thêm đoạn text giới thiệu ngắn (tiêu đề hỏi + mô tả), đặt phía trên nội dung hiện có (trước danh sách bài đọc / trước nút bắt đầu bài tập), style tương tự đoạn đang có ở tab Grammatikübungen (`text-sm font-display font-extrabold` cho tiêu đề, `text-xs text-slate-500` cho mô tả):

- **Hören**: tiêu đề "Sẵn sàng luyện nghe chưa?", mô tả "Bấm bắt đầu để nghe file âm thanh và trả lời câu hỏi trắc nghiệm đi kèm."
- **Lesen**: tiêu đề "Đã đọc kỹ đoạn văn bên trên chưa?", mô tả "Trả lời câu hỏi trắc nghiệm để kiểm tra khả năng đọc hiểu của bạn."

### 7. Dọn dẹp bắt buộc do đổi type (hệ quả trực tiếp, không phải cleanup ngoài phạm vi)

- `src/data/mockData.ts` (`SAMPLE_MODULES`): 4 bài học mẫu có field `vocabulary: [...]` theo shape cũ — phải convert sang `vocabularyMd` (dùng chung logic format ở mục 1) để không vỡ type `Lesson`. File này hiện không được import ở đâu (dead code có sẵn từ trước, không phải do thay đổi này tạo ra) nhưng vẫn phải sửa vì nó tham chiếu type `Lesson`/`Module`.
- `DashboardPage.tsx:108` — counter `{nextSuggestedLesson.vocabulary.length} từ vựng then chốt` đổi thành đếm số lần khớp regex `/\{\{[^{}]+\}\}/g` trong `nextSuggestedLesson.vocabularyMd ?? ""`.

## Ngoài phạm vi

- Không xoá cột `lessons.vocabulary` (JSONB) khỏi DB — chỉ ngừng dùng ở code.
- Không đổi luồng phát audio trong `QuizPage.tsx` (bài tập nghe) — chỉ đổi trang bài học.
- Không thêm audio thu sẵn (mp3) cho từng từ vựng — click `{{từ}}` chỉ dùng Web Speech API (speechSynthesis), giống nút loa hiện tại.
- Không đổi hệ thống `notifications` (bảng `notifications`, chuông thông báo) đã có cho tính năng Viết — đoạn "thông báo" ở mục 6 là text tĩnh trong trang, không tạo notification record.

## Testing / verification

- `npm run lint` pass sau khi đổi type `Lesson` + sửa `mockData.ts`.
- Migration: thêm cột `vocabulary_md`; verify qua `execute_sql` rằng script migrate dữ liệu convert đúng số lượng từ cho vài bài học mẫu (đối chiếu `jsonb_array_length(vocabulary)` cũ với số `{{...}}` trong `vocabulary_md` mới).
- `npm run gen:types` sau khi apply migration.
- Admin: sửa `vocabulary_md` cho 1 bài học, bấm "Xem trước" thấy render đúng + từ `{{...}}` highlight; Lưu bài học → học viên thấy nội dung mới ở tab Wortschatz.
- Học viên: tab Wortschatz — click vào từ highlight nghe phát âm (giọng de-DE); bài học chưa có `vocabulary_md` → tab Wortschatz ẩn hoàn toàn.
- Tab Hören trong trang bài học không còn hiện audio player nào; bấm "Bắt đầu bài tập nghe" vào `QuizPage` vẫn nghe được mp3 bình thường.
- Tab Hören và Lesen hiện đúng đoạn hướng dẫn mới phía trên nút bắt đầu bài tập.
- `DashboardPage` hiện đúng số từ vựng đếm từ `{{...}}` cho bài học tiếp theo.
