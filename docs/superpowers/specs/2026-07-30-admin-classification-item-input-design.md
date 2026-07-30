# Phase 0 — Ô nhập item của bài tập phân loại bị bóp còn 0 chiều rộng

Ngày: 2026-07-30

Hạng mục #4 của `requirement.md`, phase đầu tiên trong
[roadmap nền tảng bài tập](./2026-07-30-exercise-platform-roadmap.md).

## Triệu chứng

Admin mở modal **Thêm bài tập mới**, chọn dạng **Phân loại**, thêm nhóm và thêm
item. Ở mục **Items**, không nhập được nội dung item. Ô tên nhóm ngay phía trên
gõ bình thường; dropdown chọn nhóm ngay cạnh chọn bình thường và giữ giá trị.
Console không có lỗi.

## Nguyên nhân gốc

Không phải lỗi state. Ô nhập **vẫn nhận và lưu đúng giá trị** — nó bị CSS bóp còn
0 chiều rộng nội dung nên không nhìn thấy chữ.

`src/pages/admin/AdminGrammarExerciseSection.tsx:827`:

```tsx
<select className={inputCls + " w-28"} />
```

`inputCls` đã chứa sẵn `w-full` (`:148`). Trong stylesheet build ra, `.w-28` nằm
ở byte 17468 và `.w-full` ở byte 17932. Hai rule cùng độ đặc hiệu, rule đứng sau
thắng, nên **`w-28` bị vô hiệu** và `<select>` nhận `width: 100%`.

Cả hai phần tử nằm trong `<div className="flex items-center gap-2">`. `<select>`
đòi 100% chiều rộng, còn `<input>` mang `flex-1` tức `flex-basis: 0`, nên bị ép
về 0.

### Số đo thực nghiệm

Dựng lại bằng chính `dist/assets/*.css` đã build, đo trong trình duyệt thật, hàng
rộng 520px:

| Hàng | `<input>` | `<select>` |
|---|---|---|
| Code hiện tại | **26px** | 454px |
| Sau khi sửa | 368px | 112px |
| Hàng "Nhóm phân loại" (đang chạy tốt) | 488px | — |

26px đúng bằng `px-3` hai bên cộng viền, tức chiều rộng nội dung bằng 0.

Hàng "Nhóm phân loại" không lỗi vì bên cạnh nó chỉ có nút X, không có phần tử
`w-full` nào tranh chỗ. Đó là lý do triệu chứng trông như "chỉ riêng ô item hỏng".

### Các giả thuyết đã bị bác bỏ

Ghi lại để không ai điều tra lại vòng nữa:

- Logic reducer `setItemInForm` — chép nguyên văn ra harness độc lập, mô phỏng gõ
  phím thật bằng `user-event`, **pass**.
- Component remount làm mất focus — `ExerciseEntryFields` khai báo ở top-level.
- dnd-kit nuốt phím — listener chỉ gắn trên nút kéo riêng; khối phân loại không
  nằm trong `DndContext`.
- Exception trong handler — console sạch.
- Regression từ commit gần đây — 12 commit gần nhất đụng file này không chạm khối
  phân loại.
- Biến thể cũ của `setItemInForm` ghi cứng key `group` — lịch sử git cho thấy hàm
  này chưa bao giờ có dạng đó.
- Sai shape dữ liệu — seed đúng `[{"item":"ich","group":"Số ít"}]`, và lỗi xảy ra
  ở modal tạo mới nên không liên quan dữ liệu nạp từ DB.

## Cách sửa

Tách chiều rộng ra khỏi class dùng chung, thay vì vá bằng `!important`.

```tsx
const inputBaseCls = "px-3 py-2 text-sm border border-slate-200 rounded-xl focus:...";
const inputCls = `w-full ${inputBaseCls}`;
```

`inputCls` giữ nguyên giá trị cũ nên mọi chỗ đang dùng không đổi hành vi.

Tại hàng item (`:821` và `:827`):

```tsx
<input  className={`${inputBaseCls} flex-1 min-w-0`} />
<select className={`${inputBaseCls} w-28 shrink-0`} />
```

- `min-w-0` chặn ô nhập bị nội dung dài đẩy tràn khỏi hàng.
- `shrink-0` giữ dropdown đúng 112px khi hàng chật.

### Phạm vi quét

Đã quét toàn bộ `src/pages/admin/` và `src/components/`: dòng 827 là **chỗ duy
nhất** nối `inputCls` với một class chiều rộng khác. Sáu chỗ `inputCls + " flex-1"`
còn lại không có phần tử `w-full` cạnh bên nên không bị ảnh hưởng.

### Sửa kèm: `type="button"`

Bốn nút trong khối phân loại (`:796`, `:805`, `:835`, `:845`) thiếu
`type="button"`, trong khi mọi nút của khối word bank ngay bên cạnh đều có. Hôm
nay vô hại vì file không có thẻ `<form>` nào, nhưng nếu sau này bọc modal vào
`<form>` thì toàn bộ nút phân loại biến thành nút submit. Thêm vào cho đồng nhất.

## Test

Bug này là lỗi layout. **`@testing-library/react` + `jsdom` không bắt được và sẽ
không bao giờ bắt được** — jsdom không tính layout, `getBoundingClientRect()` luôn
trả 0. Test viết bằng bộ đó pass trong khi bug vẫn còn nguyên; đã kiểm chứng.

Dùng **Playwright**, vốn đã có sẵn trong devDependencies (`^1.61.0`), không cần
thêm package. Test khẳng định trên trình duyệt thật:

- Ô nhập nội dung item rộng hơn 100px.
- Dropdown chọn nhóm rộng khoảng 112px, không nuốt chỗ của ô nhập.
- Gõ vào ô item thì chữ hiện ra.

Bộ `@testing-library/react`, `@testing-library/user-event`, `jsdom`,
`global-jsdom` được giữ lại — không phục vụ bug này, mà phục vụ Phase 2, nơi cần
test tương tác cho luồng hydrate kết quả bài làm.

## Vấn đề phát hiện kèm, không thuộc Phase 0

Không test được bất kỳ component nào import `src/lib/supabase.ts`: file này đọc
`import.meta.env` ở top-level và **crash ngay lúc import** ngoài môi trường Vite.

```
TypeError: Cannot read properties of undefined (reading 'VITE_SUPABASE_URL')
```

Đã thử chèn Node module hook để vá, nhưng loader của `tsx` short-circuit nên hook
không với tới. Đây là lý do repo chưa từng có test tương tác.

Việc này **sẽ chặn Phase 2** (`GrammarExercisePage` cũng import supabase). Hai
hướng xử lý, chốt khi viết spec Phase 2:

- Tách phần cần test ra module riêng không phụ thuộc supabase.
- Đổi `src/lib/supabase.ts` sang khởi tạo lười, để import không crash.

## Định nghĩa hoàn thành

- [ ] Ô nhập nội dung item hiện đúng chiều rộng, gõ thấy chữ.
- [ ] Dropdown chọn nhóm giữ đúng 112px.
- [ ] Mọi chỗ khác dùng `inputCls` không đổi giao diện.
- [ ] Bốn nút khối phân loại có `type="button"`.
- [ ] Test Playwright pass.
- [ ] `npm run lint` sạch.
