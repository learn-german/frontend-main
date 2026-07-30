# Sửa ô nhập item bài tập phân loại bị bóp còn 0 chiều rộng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa lỗi CSS khiến ô nhập nội dung item của bài tập Phân loại trong admin bị bóp còn 0 chiều rộng, và dựng hạ tầng Playwright để kiểm chứng bằng trình duyệt thật — loại lỗi mà `jsdom` không bao giờ bắt được.

**Architecture:** Tách chiều rộng ra khỏi `inputCls` dùng chung thành một `inputBaseCls` không mang chiều rộng, rồi gán chiều rộng đúng cho từng phần tử tại hàng item. Vì đây là bug về layout (không phải về state/logic), việc kiểm chứng dùng một harness Playwright riêng: một trang Vite tối giản mount thẳng `ExerciseEntryFields` (không qua supabase, không qua đăng nhập admin), phục vụ trình duyệt Chromium thật đo `boundingBox()`.

**Tech Stack:** React 19, Tailwind CSS v4, Vite 6, Playwright (đã có sẵn trong devDependencies), `node:test` làm test runner (theo đúng quy ước hiện có của repo).

## Global Constraints

- Ngôn ngữ code: English (biến, hàm, comment kỹ thuật). Nội dung hiển thị cho user: Tiếng Việt.
- Naming: `camelCase` cho biến/hàm, `PascalCase` cho component/type.
- Không dùng `any` trong TypeScript.
- Export named exports, không dùng default export (trừ `App.tsx`).
- Không thêm npm package mới mà không hỏi trước — plan này **không** thêm package nào; `playwright`, `@vitejs/plugin-react`, `@tailwindcss/vite` đã có sẵn trong devDependencies.
- Không refactor code ngoài scope của task đang làm.
- Không xóa code có sẵn nếu không chắc nó unused.
- `npm run lint` (`tsc --noEmit`) phải sạch sau mỗi task có sửa code sản phẩm.

---

## Bối cảnh cho engineer chưa biết gì về bug này

File `src/pages/admin/AdminGrammarExerciseSection.tsx:827` có:

```tsx
<select className={inputCls + " w-28"} />
```

`inputCls` (định nghĩa tại dòng 148) đã tự chứa `w-full`. Trong CSS Tailwind build ra, rule `.w-full` đứng SAU rule `.w-28` trong file, cùng độ đặc hiệu, nên `.w-full` thắng — `<select>` chiếm 100% chiều rộng dòng. Ô `<input>` bên cạnh (dòng 821) mang class `flex-1` (tức `flex-basis: 0`) nên bị ép về 0 pixel nội dung. Học viên/admin gõ chữ vào ô đó nhưng ô rộng đúng bằng viền + padding (~26px) nên không thấy gì — nhìn như "gõ không lên chữ", dù giá trị vẫn được lưu đúng vào state.

Chi tiết điều tra và các giả thuyết đã bị loại: xem
[spec Phase 0](../specs/2026-07-30-admin-classification-item-input-design.md).

**Vì sao không viết test bằng `@testing-library/react` + `jsdom` (đã có sẵn trong repo):** `jsdom` không tính toán layout — `getBoundingClientRect()` luôn trả về `{width: 0, height: 0, ...}` bất kể CSS gì. Một test dùng jsdom sẽ PASS ngay cả khi bug này còn nguyên (đã tự kiểm chứng khi điều tra spec). Bug loại "CSS class nào thắng khi cascade" chỉ lộ ra khi có một layout engine thật.

**Vì sao không test qua toàn bộ app + đăng nhập admin thật:** `src/lib/supabase.ts` gọi `createClient(import.meta.env.VITE_SUPABASE_URL, ...)` ở top-level. Không có `.env.local` thật thì `createClient` throw ngay lúc import (`supabaseUrl is required`), nên component gốc không mount được nếu không có credentials Supabase thật và không đăng nhập được. Plan này né vấn đề đó bằng cách mount thẳng `ExerciseEntryFields` — component con không tự import supabase — trong một trang Vite riêng, có file `.env` giả (chỉ cần chuỗi hợp lệ về mặt cú pháp, `createClient` không gọi network lúc khởi tạo).

---

## File Structure

**Sửa:**
- `src/pages/admin/AdminGrammarExerciseSection.tsx` — export thêm 3 định danh đã tồn tại (`EditForm`, `EMPTY_FORM`, `ExerciseEntryFields`), tách `inputBaseCls`, sửa 2 dòng class, thêm `type="button"` cho 4 nút.

**Tạo mới (hạ tầng test Playwright, dùng lại cho Phase 2 sau này):**
- `tests/e2e/classification-fields/index.html` — trang HTML tối giản, chỉ một `<div id="root">`.
- `tests/e2e/classification-fields/main.tsx` — mount `ExerciseEntryFields` với state giả lập đúng kịch bản bug.
- `tests/e2e/classification-fields/.env` — giá trị Supabase giả, chỉ để `createClient` không throw, không gọi network thật.
- `tests/e2e/classification-fields/server.ts` — khởi động/tắt một Vite dev server thật (không phải mock) phục vụ 3 file trên.
- `tests/e2e/admin-classification-fields.playwright.test.ts` — test dùng Playwright điều khiển Chromium thật, chạy qua `node:test`.

---

## Task 1: Dựng hạ tầng Playwright harness + viết test THẤT BẠI xác nhận bug

**Files:**
- Create: `tests/e2e/classification-fields/index.html`
- Create: `tests/e2e/classification-fields/main.tsx`
- Create: `tests/e2e/classification-fields/.env`
- Create: `tests/e2e/classification-fields/server.ts`
- Create: `tests/e2e/admin-classification-fields.playwright.test.ts`
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx:106,131,456` (chỉ thêm từ khóa `export`, không đổi logic)

**Interfaces:**
- Consumes: `ExerciseEntryFields`, `EditForm`, `EMPTY_FORM` từ `src/pages/admin/AdminGrammarExerciseSection.tsx` — sau task này phải export được.
- Produces: `startHarnessServer(): Promise<{ url: string; close: () => Promise<void> }>` từ `tests/e2e/classification-fields/server.ts`, dùng bởi Task 2 và Task 3.

- [ ] **Step 1: Export ba định danh cần cho harness**

Trong `src/pages/admin/AdminGrammarExerciseSection.tsx`, chỉ thêm từ khóa `export` — không đổi bất kỳ nội dung nào khác:

Dòng 106, đổi:
```tsx
interface EditForm {
```
thành:
```tsx
export interface EditForm {
```

Dòng 131, đổi:
```tsx
const EMPTY_FORM: EditForm = {
```
thành:
```tsx
export const EMPTY_FORM: EditForm = {
```

Dòng 456, đổi:
```tsx
const ExerciseEntryFields: React.FC<{
```
thành:
```tsx
export const ExerciseEntryFields: React.FC<{
```

- [ ] **Step 2: Kiểm tra type check vẫn sạch**

Run: `npm run lint`
Expected: không có lỗi mới (đây là thay đổi thuần export, không đổi kiểu).

- [ ] **Step 3: Tạo trang HTML của harness**

Tạo `tests/e2e/classification-fields/index.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Tạo entry point mount component thật**

Tạo `tests/e2e/classification-fields/main.tsx`:

```tsx
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import {
  ExerciseEntryFields,
  EMPTY_FORM,
  type EditForm,
} from "../../../src/pages/admin/AdminGrammarExerciseSection";

// Dựng đúng cách modal thật nối ExerciseEntryFields vào state: một entry,
// cập nhật qua updater function. Đây là component THẬT của production,
// không phải bản sao chép — nếu code nguồn đổi mà quên cập nhật chỗ này,
// TypeScript sẽ báo lỗi biên dịch chứ không âm thầm test sai thứ khác.
const Harness = () => {
  const [entry, setEntry] = useState<EditForm>({
    ...EMPTY_FORM,
    type: "classification",
    classification_groups: ["Der", "Die"],
    classification_items: [{ item: "", group: "Der" }],
  });
  return (
    <div style={{ maxWidth: 520, padding: 24 }}>
      <ExerciseEntryFields entry={entry} onChange={(updater) => setEntry(updater)} />
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<Harness />);
```

- [ ] **Step 5: Tạo file env giả cho harness**

Tạo `tests/e2e/classification-fields/.env`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key-for-playwright-harness-only
```

Đây không phải secret thật — chỉ là chuỗi hợp lệ về cú pháp để
`createClient()` trong `src/lib/supabase.ts` không throw lúc import. Harness
không bao giờ gọi network tới Supabase.

- [ ] **Step 6: Tạo module khởi động Vite dev server thật cho harness**

Tạo `tests/e2e/classification-fields/server.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const HARNESS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export interface Harness {
  url: string;
  close: () => Promise<void>;
}

// Dùng đúng Vite dev server thật (cùng plugin @tailwindcss/vite mà app dùng
// để build production), không phải bản mock CSS thủ công. Tailwind v4 quét
// toàn bộ project để sinh rule, nên CSS ở đây giống hệt CSS mà admin thật
// nhận được — bug do class nào thắng trong cascade sẽ tái hiện đúng.
export async function startHarnessServer(): Promise<Harness> {
  const server: ViteDevServer = await createServer({
    root: HARNESS_ROOT,
    envDir: HARNESS_ROOT,
    configFile: false,
    logLevel: "error",
    plugins: [react(), tailwindcss()],
    server: { port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  if (!port) {
    throw new Error("Vite harness server không lấy được cổng đã lắng nghe");
  }
  return {
    url: `http://localhost:${port}/index.html`,
    close: () => server.close(),
  };
}
```

- [ ] **Step 7: Viết test THẤT BẠI xác nhận đúng bug đã chẩn đoán**

Tạo `tests/e2e/admin-classification-fields.playwright.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { startHarnessServer, type Harness } from "./classification-fields/server.ts";

let harness: Harness;
let browser: Browser;
let page: Page;

test.before(async () => {
  harness = await startHarnessServer();
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(harness.url);
});

test.after(async () => {
  await browser.close();
  await harness.close();
});

test("ô nhập nội dung item đủ rộng để đọc được chữ đã gõ", async () => {
  const itemInput = page.getByPlaceholder("Tisch");
  const groupSelect = page.locator("select");

  const itemBox = await itemInput.boundingBox();
  const selectBox = await groupSelect.boundingBox();

  assert.ok(itemBox, "ô nhập item phải render ra được");
  assert.ok(selectBox, "dropdown chọn nhóm phải render ra được");
  // Bug hiện tại: input ~26px (bị bóp về 0 nội dung), select ~450px+
  // (thừa hưởng w-full, chiếm gần hết dòng). Ngưỡng dưới đây thất bại với
  // bug và sẽ pass sau khi Task 2 tách inputBaseCls.
  assert.ok(
    itemBox!.width > 150,
    `ô nhập item phải rộng hơn 150px, đang là ${itemBox!.width}px`,
  );
  assert.ok(
    selectBox!.width < 150,
    `dropdown phải hẹp hơn 150px (khoảng 112px), đang là ${selectBox!.width}px`,
  );
});

test("gõ được nội dung vào ô item và đọc lại đúng giá trị", async () => {
  const itemInput = page.getByPlaceholder("Tisch");
  await itemInput.fill("Tisch");
  assert.equal(await itemInput.inputValue(), "Tisch");
});
```

- [ ] **Step 8: Cài Chromium cho Playwright nếu chưa có (một lần)**

Run: `npx playwright install chromium`
Expected: tải xong, không lỗi. Bỏ qua bước này nếu máy đã có sẵn.

- [ ] **Step 9: Chạy test, xác nhận THẤT BẠI đúng như chẩn đoán**

Run: `npx tsx --test tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: FAIL ở test đầu tiên, thông báo dạng
`ô nhập item phải rộng hơn 150px, đang là 26px` (con số cụ thể có thể lệch vài
pixel, nhưng phải nhỏ hơn 150 và assertion `selectBox!.width < 150` cũng fail
vì select thực tế rộng ~450px+). Test thứ hai ("gõ được nội dung") có thể PASS
hoặc FAIL tùy trình duyệt — không quan trọng ở bước này, vì assertion về độ
rộng đã đủ xác nhận bug.

Nếu test đầu tiên PASS ngay ở bước này: **dừng lại**, không sang Task 2 — nghĩa
là môi trường chạy không tái hiện đúng bug đã chẩn đoán trong spec, cần điều tra
lại trước khi tiếp tục.

- [ ] **Step 10: Commit hạ tầng test + export**

```bash
git add tests/e2e src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "test(admin): dựng Playwright harness tái hiện bug ô nhập item bị bóp 0px"
```

---

## Task 2: Sửa CSS — tách `inputBaseCls` khỏi `inputCls`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx:148-149,821,827`

**Interfaces:**
- Consumes: test Playwright đã viết ở Task 1 (`tests/e2e/admin-classification-fields.playwright.test.ts`), phải chuyển từ FAIL sang PASS mà không sửa test.
- Produces: `inputBaseCls` (hằng số mới, không mang chiều rộng) — dùng lại ở Task 3 nếu cần, và là điểm tham chiếu cho bất kỳ chỗ nào sau này cần input không phải `w-full`.

- [ ] **Step 1: Tách `inputBaseCls`, giữ `inputCls` không đổi giá trị**

Trong `src/pages/admin/AdminGrammarExerciseSection.tsx`, dòng 148-149, đổi:

```tsx
const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
```

thành:

```tsx
const inputBaseCls =
  "px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
const inputCls = `w-full ${inputBaseCls}`;
```

`inputCls` sau khi ghép chuỗi cho ra đúng giá trị cũ — mọi chỗ khác đang dùng
`inputCls` (kể cả `inputCls + " flex-1"` ở 6 nơi khác trong `AdminGrammarExerciseSection.tsx`
và `AdminQuizSection.tsx`) không đổi hành vi.

- [ ] **Step 2: Dùng `inputBaseCls` cho đúng hai class đang xung đột**

Dòng 821 (ô nhập item), đổi:

```tsx
                  className={inputCls + " flex-1"}
```

thành:

```tsx
                  className={`${inputBaseCls} flex-1 min-w-0`}
```

Dòng 827 (dropdown chọn nhóm), đổi:

```tsx
                  className={inputCls + " w-28"}
```

thành:

```tsx
                  className={`${inputBaseCls} w-28 shrink-0`}
```

`min-w-0` chặn ô nhập bị nội dung dài đẩy tràn khỏi hàng flex. `shrink-0` giữ
dropdown đúng chiều rộng cố định 112px khi hàng chật.

- [ ] **Step 3: Chạy lại test Playwright, xác nhận PASS**

Run: `npx tsx --test tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS cả hai test.

- [ ] **Step 4: Kiểm tra type check sạch**

Run: `npm run lint`
Expected: không lỗi.

- [ ] **Step 5: Chạy lại toàn bộ test hiện có, xác nhận không có regression**

Run: `npx tsx --test "src/**/*.test.ts"`
Expected: PASS toàn bộ (42 test tại thời điểm viết plan này, con số có thể
tăng nếu có test mới từ nhánh khác).

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "fix(admin): tách inputBaseCls, sửa ô nhập item phân loại bị bóp 0px"
```

---

## Task 3: Thêm `type="button"` cho 4 nút trong khối phân loại

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx:797,805,837,845`
- Modify: `tests/e2e/admin-classification-fields.playwright.test.ts` (thêm một test)

**Interfaces:**
- Consumes: `startHarnessServer` từ Task 1, không đổi.
- Produces: không có gì tiêu thụ tiếp theo — đây là task cuối chuỗi sửa lỗi.

**Bối cảnh:** File này không có thẻ `<form>` nào nên các nút thiếu
`type="button"` hôm nay vô hại — nhưng mọi nút của khối word bank ngay bên cạnh
đều có `type="button"`, còn 4 nút của khối phân loại thì không. Nếu sau này ai
đó bọc modal vào `<form>`, các nút này sẽ tự động thành nút submit. Sửa cho
đồng nhất và an toàn trước.

- [ ] **Step 1: Viết test xác nhận thiếu `type="button"` (THẤT BẠI)**

Thêm vào cuối `tests/e2e/admin-classification-fields.playwright.test.ts`:

```ts
test("mọi nút trong khối phân loại có type=\"button\"", async () => {
  const buttonTypes = await page.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("type")),
  );
  for (const type of buttonTypes) {
    assert.equal(type, "button", "mỗi nút trong khối phân loại phải khai báo type=\"button\"");
  }
});
```

Run: `npx tsx --test tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: FAIL — các nút X (xoá nhóm/xoá item) và nút "Thêm nhóm"/"Thêm item"
hiện có `type` là `null` (mặc định của `<button>` không khai báo là
`"submit"` theo HTML spec, nhưng thuộc tính `type` đọc qua `getAttribute`
trả `null` nếu không viết tường minh — assertion trên sẽ fail vì `null !== "button"`).

- [ ] **Step 2: Thêm `type="button"` vào 4 nút**

Dòng 797 (nút xoá nhóm — icon X), đổi:

```tsx
                <button
                  onClick={() => onChange((prev) => removeGroupFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
```

thành:

```tsx
                <button
                  type="button"
                  onClick={() => onChange((prev) => removeGroupFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
```

Dòng 805 (nút "Thêm nhóm"), đổi:

```tsx
            <button
              onClick={() => onChange(addGroupToForm)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
            >
```

thành:

```tsx
            <button
              type="button"
              onClick={() => onChange(addGroupToForm)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
            >
```

Dòng 837 (nút xoá item — icon X), đổi:

```tsx
                <button
                  onClick={() => onChange((prev) => removeItemFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
```

thành:

```tsx
                <button
                  type="button"
                  onClick={() => onChange((prev) => removeItemFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
```

Dòng 845 (nút "Thêm item"), đổi:

```tsx
            <button
              onClick={() => onChange(addItemToForm)}
              disabled={entry.classification_groups.filter(Boolean).length === 0}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
```

thành:

```tsx
            <button
              type="button"
              onClick={() => onChange(addItemToForm)}
              disabled={entry.classification_groups.filter(Boolean).length === 0}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
```

- [ ] **Step 3: Chạy lại test, xác nhận PASS**

Run: `npx tsx --test tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS cả ba test.

- [ ] **Step 4: Kiểm tra type check sạch**

Run: `npm run lint`
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx tests/e2e/admin-classification-fields.playwright.test.ts
git commit -m "fix(admin): thêm type=\"button\" cho 4 nút khối phân loại, tránh bẫy submit sau này"
```

---

## Task 4: Regression toàn cục + đóng Phase 0

**Files:** không sửa thêm — chỉ chạy kiểm tra tổng và cập nhật spec.
- Modify: `docs/superpowers/specs/2026-07-30-admin-classification-item-input-design.md` (tick Definition of Done)

**Interfaces:**
- Consumes: toàn bộ test suite hiện có + test mới từ Task 1-3.
- Produces: không có gì — đây là task đóng phase.

- [ ] **Step 1: Chạy toàn bộ unit test hiện có**

Run: `npx tsx --test "src/**/*.test.ts"`
Expected: PASS toàn bộ, không giảm số lượng test so với trước khi bắt đầu.

- [ ] **Step 2: Chạy toàn bộ test Playwright**

Run: `npx tsx --test tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS cả ba test.

- [ ] **Step 3: Type check toàn bộ**

Run: `npm run lint`
Expected: không lỗi.

- [ ] **Step 4: Build production, xác nhận không vỡ**

Run: `npm run build`
Expected: build thành công, không cảnh báo mới liên quan đến
`AdminGrammarExerciseSection.tsx`.

- [ ] **Step 5: Tick Definition of Done trong spec**

Trong `docs/superpowers/specs/2026-07-30-admin-classification-item-input-design.md`,
mục "Định nghĩa hoàn thành", tick cả 6 dòng:

```markdown
- [x] Ô nhập nội dung item hiện đúng chiều rộng, gõ thấy chữ.
- [x] Dropdown chọn nhóm giữ đúng 112px.
- [x] Mọi chỗ khác dùng `inputCls` không đổi giao diện.
- [x] Bốn nút khối phân loại có `type="button"`.
- [x] Test Playwright pass.
- [x] `npm run lint` sạch.
```

- [ ] **Step 6: Commit đóng phase**

```bash
git add docs/superpowers/specs/2026-07-30-admin-classification-item-input-design.md
git commit -m "docs: đóng Phase 0 — bug ô nhập item phân loại đã sửa và có test bảo vệ"
```

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:**
- Chẩn đoán CSS (spec mục "Nguyên nhân gốc") → Task 2.
- Cách sửa đề xuất (spec mục "Cách sửa") → Task 2, Step 1-2, đúng nguyên văn.
- Sửa kèm `type="button"` (spec mục "Sửa kèm") → Task 3.
- Yêu cầu test Playwright, không dùng jsdom (spec mục "Test") → Task 1.
- Định nghĩa hoàn thành (spec) → Task 4, Step 5.
- Vấn đề `src/lib/supabase.ts` crash khi import (spec mục "Vấn đề phát hiện
  kèm") → **không** xử lý trong plan này, đúng như spec đã ghi rõ "chốt khi viết
  spec Phase 2". Plan này chỉ né nó bằng harness riêng, không sửa
  `supabase.ts`.

**Placeholder scan:** không còn "TBD", không có bước nào thiếu code cụ thể;
mọi lệnh chạy test đều có output kỳ vọng cụ thể.

**Type consistency:** `EditForm`, `EMPTY_FORM`, `ExerciseEntryFields` dùng
xuyên suốt Task 1-3 với đúng tên đã export ở Task 1 Step 1.
