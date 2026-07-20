# Admin — Tạo và chỉnh sửa bài tập ngữ pháp (6 dạng bài)

## Bối cảnh

Admin hiện có mục "Bài tập" (`AdminQuizSection.tsx`, bảng `quiz_questions`) hỗ trợ 4 dạng: trắc nghiệm, điền chỗ trống, ghép đôi, nghe hiểu — gắn với category `nguphap`/`nghe`/`doc`.

Ticket này yêu cầu thêm 6 dạng bài tập ngữ pháp **hoàn toàn khác** với 4 dạng trên:

- `word_reorder` — Sắp xếp từ thành câu đúng.
- `error_correction` — Sửa câu sai.
- `translation` — Dịch Việt → Đức.
- `sentence_transformation` — Biến đổi câu theo yêu cầu.
- `guided_sentence_writing` — Viết câu từ dữ liệu gợi ý.
- `classification` — Phân loại item vào đúng nhóm.

## Phạm vi

**Chỉ Admin CRUD**: tạo/sửa/xóa/preview/lưu nháp/publish 6 dạng bài tập, lưu vào DB. **Không bao gồm** trang học viên làm bài hay API chấm điểm — để lại cho task sau (giống cách `quiz_questions_public` được thêm sau khi có `quiz_questions`).

Repo hiện không có test framework (không Jest/Vitest, không file test nào). DoD "có test" được đáp ứng bằng **verify thủ công qua browser** (không thêm dependency mới), không viết automated test.

## Quyết định thiết kế đã chốt

- Bảng mới `grammar_exercises`, tách biệt hoàn toàn với `quiz_questions` — không đụng đến bài tập cũ.
- Cột tùy loại (nullable) thay vì 1 JSONB blob tổng, theo đúng pattern `quiz_questions.options`/`matching_pairs` đã có.
- `status` (`draft`/`published`) là cột riêng **theo từng bài tập**, không dựa vào `lessons.status` — vì ticket yêu cầu publish/draft ở cấp bài tập, khác với `quiz_questions` (không có status riêng, chỉ ẩn hiện theo `lessons.status`).
- RLS: chỉ `FOR ALL` cho admin (`app_metadata.role = 'admin'`), **không có SELECT policy công khai** — chưa có consumer phía học viên.
- Không cần Edge Function mới — CRUD qua `supabase-js` trực tiếp với admin JWT, giống `AdminQuizSection.tsx`.
- Validate ở client (không thêm DB CHECK constraint riêng từng loại) — chỉ có 1 đường ghi dữ liệu (Admin UI) nên validate phía server (DB) là dư thừa.
- Bài tập gắn với `lesson_id` cụ thể (giống `quiz_questions.lesson_id`), không phải ngân hàng độc lập theo level.

## Thiết kế chi tiết

### 1. Migration `supabase/migrations/<timestamp>_grammar_exercises.sql`

```sql
CREATE TABLE grammar_exercises (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id              TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type                   TEXT    NOT NULL CHECK (type IN (
                            'word_reorder', 'error_correction', 'translation',
                            'sentence_transformation', 'guided_sentence_writing', 'classification'
                          )),
  status                 TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  prompt_text            TEXT,   -- error_correction/translation/sentence_transformation/guided_sentence_writing
  transformation_hint    TEXT,   -- sentence_transformation only, vd "Ja/Nein-Frage"
  correct_answer         TEXT,   -- mọi loại trừ classification
  tokens                 JSONB,  -- word_reorder: string[] các từ đã cho, theo đúng thứ tự hiển thị
  classification_groups  JSONB,  -- classification: string[] vd ["der","die","das"]
  classification_items   JSONB,  -- classification: {item: string, group: string}[]
  explanation            TEXT    NOT NULL DEFAULT '',
  order_index            INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE grammar_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grammar_exercises: admin write"
  ON grammar_exercises FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

Sau khi migrate, chạy `npm run gen:types` để cập nhật `src/lib/database.types.ts`.

### 2. `src/pages/admin/AdminPage.tsx`

- Thêm `"grammar-exercises"` vào union `AdminSection`.
- Thêm nav item mới: label **"Bài tập ngữ pháp"**, import và render `AdminGrammarExerciseSection` khi `section === "grammar-exercises"`.
- Không đổi mục "Bài tập" (`quiz`) hiện có.

### 3. `src/pages/admin/AdminGrammarExerciseSection.tsx` (file mới)

Mirror cấu trúc `AdminQuizSection.tsx`:

- Fetch toàn bộ `lessons` + `grammar_exercises`, group theo lesson (giống `LessonGroup`), search theo tên lesson.
- Mỗi lesson expand ra bảng: cột `#`, **Loại** (badge màu, nhãn theo bảng dưới), **Nội dung** (rút gọn `prompt_text`/`correct_answer`/số item tùy loại), **Trạng thái** (badge "Nháp"/"Đã publish"), actions (Preview, Sửa, Xóa).
- Nút "+ Thêm bài tập" → modal chọn `type` → form đổi theo `type` đã chọn.

Nhãn loại (`TYPE_LABELS` mới, tương tự hằng số đã có trong `AdminQuizSection`):

| type | Nhãn | Màu badge |
|---|---|---|
| word_reorder | Sắp xếp từ | `bg-blue-50 text-blue-700` |
| error_correction | Sửa câu sai | `bg-rose-50 text-rose-700` |
| translation | Dịch | `bg-emerald-50 text-emerald-700` |
| sentence_transformation | Biến đổi câu | `bg-purple-50 text-purple-700` |
| guided_sentence_writing | Viết câu gợi ý | `bg-amber-50 text-amber-700` |
| classification | Phân loại | `bg-teal-50 text-teal-700` |

**Form theo từng loại** (state form đổi field hiển thị dựa trên `type`, giống `EMPTY_FORM` + conditional render trong `AdminQuizSection`):

- **word_reorder**: input text "Các từ cho sẵn" — nhập dạng `am Abend / ich / Musik / höre` (tách bằng `/`, trim từng phần → `tokens: string[]` khi lưu; khi sửa, join ngược lại bằng ` / ` để hiển thị) + textarea "Câu đúng" (`correct_answer`).
- **error_correction**: textarea "Câu sai" (`prompt_text`) + textarea "Câu đúng" (`correct_answer`).
- **translation**: textarea "Câu tiếng Việt" (`prompt_text`) + textarea "Câu tiếng Đức" (`correct_answer`).
- **sentence_transformation**: textarea "Câu gốc" (`prompt_text`) + input "Yêu cầu biến đổi" (`transformation_hint`) + textarea "Câu đúng sau biến đổi" (`correct_answer`).
- **guided_sentence_writing**: textarea "Dữ liệu gợi ý" (`prompt_text`) + textarea "Câu đúng" (`correct_answer`).
- **classification**: chip-input "Nhóm phân loại" (thêm/xóa nhãn nhóm → `classification_groups: string[]`) + danh sách item lặp lại (input text + dropdown chọn 1 nhóm trong `classification_groups`) → `classification_items: {item, group}[]`, nút "+ Thêm item" (disable nếu chưa có nhóm nào).

Field chung: textarea "Giải thích" (`explanation`), input số "Thứ tự" (`order_index`, mặc định = số bài tập hiện có của lesson).

### 4. Validation (`handleSave`, theo đúng convention `showToast(msg, "warning")` + return sớm, không gọi API khi lỗi)

Kiểm tra tuần tự theo `type`:

- **word_reorder**: tokens (sau khi split `/` + trim, bỏ phần tử rỗng) phải ≥ 2 → `"Cần ít nhất 2 từ."`; `correct_answer` không rỗng → `"Câu đúng không được để trống."`; so khớp tập từ: tách `correct_answer` thành từ (split khoảng trắng, lowercase, bỏ `.,!?`) và so sánh (dạng multiset, không quan tâm thứ tự) với tokens đã chuẩn hóa tương tự → nếu không khớp: `"Các từ cho sẵn không khớp với câu đúng — kiểm tra lại chính tả."`
- **error_correction**: `prompt_text` không rỗng → `"Câu sai không được để trống."`; `correct_answer` không rỗng → `"Câu đúng không được để trống."`; `prompt_text.trim() !== correct_answer.trim()` → `"Câu sai và câu đúng giống nhau — không có lỗi để sửa."`
- **translation**: `prompt_text` không rỗng → `"Câu tiếng Việt không được để trống."`; `correct_answer` không rỗng → `"Câu tiếng Đức không được để trống."`
- **sentence_transformation**: `prompt_text`, `transformation_hint`, `correct_answer` không rỗng — thông báo riêng từng field.
- **guided_sentence_writing**: `prompt_text`, `correct_answer` không rỗng.
- **classification**: `classification_groups` ≥ 2 phần tử, không rỗng/không trùng (case-insensitive) → `"Cần ít nhất 2 nhóm phân loại, không trùng tên."`; `classification_items` ≥ 1 → `"Cần ít nhất 1 item để phân loại."`; mỗi item có `item` không rỗng và `group` ∈ `classification_groups` (đảm bảo tự động vì chọn qua dropdown, không nhập tay).

**Lỗi lưu**: `setSaving(true)` → `supabase.from("grammar_exercises").insert/update()` → lỗi: `showToast("Lưu thất bại: " + error.message, "warning")`, modal giữ nguyên (không đóng, không mất dữ liệu form); thành công: `showToast(editId ? "Đã cập nhật bài tập." : "Đã thêm bài tập.", "success")`, đóng modal, refetch.

### 5. Preview

Modal riêng, read-only, render theo `type`:

- word_reorder: các từ dạng chip theo đúng thứ tự đã nhập, bên dưới là câu đúng.
- error_correction: "Câu sai" (gạch ngang, nền đỏ nhạt) và "Câu đúng" (nền xanh).
- translation: câu VI → mũi tên → câu DE.
- sentence_transformation: câu gốc + badge "Yêu cầu: {transformation_hint}" + câu kết quả.
- guided_sentence_writing: dữ liệu gợi ý (nguyên văn) + câu kết quả.
- classification: mỗi nhóm là 1 cột, item xếp đúng cột nhóm tương ứng.
- Luôn hiển thị "Giải thích" ở cuối nếu có.

### 6. Draft / Publish

Mirror pattern `AdminLessonEditor.tsx`: badge trạng thái trong bảng + trong modal sửa có 2 nút "Lưu nháp" / "Publish" gọi `supabase.from("grammar_exercises").update({ status })`.

## Ngoài phạm vi

- Trang học viên làm bài tập ngữ pháp (hiển thị `word_reorder`, kéo-thả, chấm điểm...) — task riêng.
- Edge Function chấm điểm cho 6 dạng bài — task riêng, cùng lúc với trang học viên.
- View public (`grammar_exercises_public`) ẩn `correct_answer`/`classification_items` — chỉ cần khi có consumer phía học viên.
- Không đổi `quiz_questions`, `AdminQuizSection.tsx`, hay bất kỳ luồng bài tập cũ nào.
- Không thêm test framework (Vitest/Jest) — verify thủ công qua browser.

## Testing / verification

- `npm run lint` pass (`tsc --noEmit`).
- Test browser thủ công cho từng dạng trong 6 dạng:
  - Tạo mới thành công với dữ liệu hợp lệ, kiểm tra hiển thị đúng trong bảng (badge loại, trạng thái Nháp mặc định).
  - Thử lưu với dữ liệu thiếu bắt buộc → xác nhận toast lỗi đúng thông báo, modal không đóng.
  - word_reorder: thử tokens không khớp câu đúng → xác nhận bị chặn với thông báo phù hợp.
  - error_correction: thử câu sai = câu đúng → xác nhận bị chặn.
  - classification: thử item với nhóm không tồn tại (nếu có thể tạo qua UI) và thử < 2 nhóm → xác nhận bị chặn.
  - Sửa 1 bài tập đã tạo, xác nhận dữ liệu load lại đúng field theo từng loại (không mất, không lẫn loại).
  - Bấm Preview cho từng loại, xác nhận hiển thị đúng nội dung.
  - Publish 1 bài, xác nhận badge đổi "Đã publish"; chuyển lại "Lưu nháp", xác nhận đổi ngược.
  - Xóa 1 bài tập, xác nhận biến mất khỏi bảng.
  - Xác nhận mục "Bài tập" (quiz cũ) không bị ảnh hưởng — dữ liệu cũ vẫn nguyên vẹn.
