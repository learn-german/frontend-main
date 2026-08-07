# Đổi UI câu hỏi "Phân loại" (classification) — học viên + Admin

## Bối cảnh

Loại câu hỏi `classification` hiện dùng UI dropdown (học viên chọn nhóm cho từng item qua `<select>`; Admin nhập tên nhóm và item qua 2 danh sách tách rời). User cung cấp 2 ảnh mockup: phía học viên là layout "chip từ chưa xếp ở trên + cột nhóm bên dưới" (giống drag-and-drop nhưng dùng click); phía Admin là layout "mỗi nhóm 1 card, chứa sẵn danh sách từ + nút thêm từ riêng".

Đã xác nhận qua đọc code: đây là thay đổi **thuần UI/tương tác**, không đổi data model. `classification_groups: string[]` / `classification_items: {item, group}[]` (Admin) và `itemGroups: Record<item, group>` (học viên, đã truyền qua prop `ExerciseAnswerInput`/`ExerciseResultReview`) giữ nguyên hình dạng — không đổi `grammar-submit`, không đổi `validateForm`/`buildPayload` (trừ 1 hàm nhỏ mô tả ở dưới), không đổi database.

## Kiến trúc

### 1. Học viên — `ExerciseAnswerInput.tsx`

Thay khối `<select>` (dòng ~228-251 hiện tại) bằng:
- Khu "chưa xếp": chip cho mọi `item` mà `itemGroups[item]` rỗng/không có.
- N cột nhóm theo đúng thứ tự `exercise.classificationGroups`: mỗi cột có header (tên nhóm) + danh sách chip cho item có `itemGroups[item] === group đó`.
- State mới **cục bộ trong component** (không đổi props): `selectedItem: string | null` — item đang được "nhặt lên" chờ chọn đích.
- Click chip chưa xếp hoặc đã xếp → `setSelectedItem(item)` (nếu click lại chính chip đang chọn thì bỏ chọn). Khi `selectedItem` khớp item đang render, chip có viền cam nổi bật; 3+ cột nhóm có `animate-pulse` mời click.
- Click header cột nhóm khi đang có `selectedItem` → gọi `onItemGroupChange(selectedItem, group)` (prop đã có sẵn, không đổi signature), rồi `setSelectedItem(null)`.
- Không có `selectedItem` thì click cột nhóm không làm gì.

Prop interface `ExerciseAnswerInput` **không đổi** — `itemGroups`/`onItemGroupChange` dùng nguyên như cũ.

### 2. Kết quả — `ExerciseResultReview` (cùng file `ExerciseAnswerInput.tsx`)

Đổi khối classification (dòng ~416-443) từ danh sách phẳng sang cùng layout cột nhóm:
- Cột theo `exercise.classificationGroups`, mỗi cột hiện item có `userGroups[item] === group đó`, tô viền xanh nếu đúng (`classificationResults[itemIndex]`), đỏ nếu sai; nếu sai và `revealed`, hiện thêm đáp án đúng cạnh bên (dùng `getCorrectGroups` đã có sẵn, không đổi).
- Item chưa trả lời (`userGroups[item]` rỗng) → khu "Chưa trả lời" riêng, không thuộc cột nào.

Prop interface `ExerciseResultReview` **không đổi**.

### 3. Admin — `AdminGrammarExerciseSection.tsx` (`ExerciseEntryFields`, khối classification dòng ~722-798)

Thay 2 khối tách rời bằng danh sách card nhóm:
- Mỗi card: input tên nhóm (dùng `setGroupInForm` có sẵn — đã tự cập nhật `group` của các item liên quan khi đổi tên, không cần sửa), nút xoá nhóm (dùng `removeGroupFromForm`, **sửa hành vi** — xem mục 4), danh sách chip từ thuộc nhóm đó (mỗi chip là 1 `<input>` nhỏ dùng `setItemInForm`/`removeItemFromForm` có sẵn theo đúng index gốc trong `classification_items`), nút "+ Thêm từ" cuối card (hàm mới `addWordToGroup`, xem mục 4) — disable nếu tên nhóm đang rỗng.
- Nút "+ Thêm nhóm" cuối danh sách card (dùng `addGroupToForm` có sẵn, không đổi).
- Cách nhóm item theo card: duyệt 1 lần `entry.classification_items`, build `Map<group, Array<{item, originalIndex}>>` để giữ đúng index gốc cho `setItemInForm`/`removeItemFromForm` — không thêm state mới, không đổi cấu trúc `classification_items`.

### 4. `src/lib/grammarExerciseForm.ts` — 1 hàm mới, 1 hàm sửa hành vi

Hàm mới:
```ts
export const addWordToGroup = (f: EditForm, group: string): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group }],
});
```

Sửa `removeGroupFromForm` — hiện tại gỡ gán (set `group: ""`) các item thuộc nhóm bị xoá, đổi thành **xoá luôn** các item đó (đã duyệt: mockup Admin không có khu "chưa gán" để chứa item mồ côi):
```ts
export const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.filter((it) => it.group !== removed),
  };
};
```

`validateForm`/`buildPayload` không đổi — vẫn hoạt động đúng trên `classification_groups`/`classification_items` bất kể UI nào tạo ra chúng.

## Không đổi

- Không đổi `grammar-submit` (scoring, wire format `correctAnswerRaw`).
- Không đổi database/migration.
- Không đổi prop interface của `ExerciseAnswerInput`/`ExerciseResultReview` — chỉ đổi JSX bên trong.
- Không đổi `validateForm`/`buildPayload`/`addGroupToForm`/`setGroupInForm`/`addItemToForm`/`setItemInForm`/`removeItemFromForm` — dùng nguyên.
- Không đổi các loại câu hỏi khác.

## Testing

- `addWordToGroup`/`removeGroupFromForm` (bản sửa) là hàm thuần — thêm test vào `src/lib/grammarExerciseForm.test.ts` theo đúng pattern test hiện có.
- `npm run lint` sau khi sửa.
- Xác minh thủ công trên trình duyệt (sandbox không có `.env.local` — chỉ ghi checklist): làm 1 bài phân loại kiểu click-chọn-click-đích, xác nhận chuyển nhóm/bỏ ra hoạt động đúng; xem card kết quả sau khi nộp hiện đúng cột + màu đúng/sai; ở Admin tạo/sửa/xoá nhóm và từ theo UI card mới, xác nhận lưu đúng dữ liệu (so với dữ liệu cũ đã có, không bị vỡ khi sửa câu cũ).

## Rủi ro

- Xoá nhóm ở Admin giờ xoá luôn từ bên trong (khác hành vi cũ) — nếu admin sửa 1 câu phân loại cũ đã có sẵn dữ liệu và lỡ xoá nhóm, mất dữ liệu từ ngay lập tức, không có undo. Chấp nhận theo yêu cầu, nhưng cần lưu ý khi test thủ công với dữ liệu thật.
- Đổi UI học viên có thể ảnh hưởng trải nghiệm với câu phân loại có rất nhiều item/nhóm (layout cột có thể chật trên màn hình nhỏ) — không có yêu cầu responsive cụ thể, dùng wrap tự nhiên (flex-wrap) như các chip khác trong file.
