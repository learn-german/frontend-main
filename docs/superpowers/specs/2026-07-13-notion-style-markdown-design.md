# Notion-style Markdown rendering cho "Ngữ pháp then chốt"

## Bối cảnh

`src/components/MarkdownBlock.tsx` là component tự viết (không phụ thuộc thư viện) để render nội dung markdown của `lesson.grammarMd` / `data.grammar_md`, dùng ở [LessonDetailPage.tsx](../../../src/pages/LessonDetailPage.tsx) và [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx).

Trước đó component này chỉ hỗ trợ: heading `#`–`######`, bold/italic/code inline, list 1 cấp (`-`/`*`), blockquote, `---`, và bảng markdown (`| ... |`, kể cả cell bị Notion tách xuống dòng — fix trong phiên trước).

Admin thường soạn nội dung bằng cách copy từ Notion và paste (Ctrl+V, dạng plain text) vào textarea trong `AdminLessonEditor`. Notion khi paste plain text tự chuyển sang cú pháp gần giống markdown, nhưng còn thiếu các block sau mà admin cần:

- Checkbox / to-do list (`- [ ]`, `- [x]`)
- Danh sách lồng nhau nhiều cấp
- Code block nhiều dòng (```` ```lang ... ``` ````)
- Callout màu (Notion không xuất ra markdown chuẩn cho callout — paste ra thường chỉ là icon + text trên 1 dòng, không có cú pháp đặc biệt)

## Quyết định kiến trúc

Chuyển từ parser tự viết sang **`react-markdown` + `remark-gfm`** (2 package mới, ~35KB gzip), thay vì tiếp tục mở rộng parser tay.

Lý do: `remark-gfm` đã hỗ trợ sẵn, đã được test kỹ: bảng, task-list checkbox, list lồng nhau, heading h1–h6, strikethrough, autolink. Viết tay các phần này (đặc biệt nested list với thụt lề hỗn hợp, code fence) có rủi ro edge-case cao hơn nhiều so với dùng thư viện chuẩn.

Đây là ngoại lệ so với quy tắc "không thêm npm package mà không hỏi trước" trong CLAUDE.md — đã hỏi và được người dùng đồng ý dùng Hướng B.

## Phạm vi thay đổi

Chỉ sửa `src/components/MarkdownBlock.tsx`. Props giữ nguyên `{ content: string; className?: string }` nên không cần đổi gì ở nơi gọi ([LessonDetailPage.tsx:132](../../../src/pages/LessonDetailPage.tsx), [AdminLessonEditor.tsx:197](../../../src/pages/admin/AdminLessonEditor.tsx)).

Cập nhật hint text trong `AdminLessonEditor.tsx` (dòng đang ghi "Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách") để nhắc thêm các cú pháp mới.

## Thiết kế chi tiết

### 1. Dependencies

Thêm vào `package.json`:
- `react-markdown`
- `remark-gfm`

### 2. Preprocessing (trước khi đưa vào `ReactMarkdown`)

Hàm `preprocess(content: string): string` chạy 2 bước biến đổi trên raw string:

**a. Gộp table row bị tách dòng giữa cell** (giữ nguyên logic đã fix ở bug trước, port sang dạng tiền xử lý text thay vì tự parse bảng):
- Quét từng dòng bắt đầu bằng `|`; nếu dòng chưa kết thúc bằng `|` (sau khi trim), nối với dòng kế tiếp bằng `<br/>` (thay cho `\n`) cho đến khi gặp dòng kết thúc bằng `|`.
- Kết quả: mỗi logical row nằm trên 1 dòng vật lý, cell nào có xuống dòng thì giờ chứa tag `<br/>` — hợp lệ trong GFM table (remark-gfm cho phép raw HTML inline trong cell).

**b. Bọc dòng callout trần thành blockquote:**
- Với mỗi dòng không thuộc code fence (giữa cặp ` ``` `), nếu dòng (sau trim) bắt đầu bằng 1 trong các icon: `💡 ⚠️ ❗ ✅ ℹ️`, và dòng đó không đã bắt đầu bằng `>`, `-`, `*`, số thứ tự, hoặc `|` — prefix bằng `> ` để trở thành blockquote hợp lệ.
- Bỏ qua các dòng nằm trong code fence (đếm số lần gặp ` ``` ` để biết đang trong/ngoài fence, không biến đổi nội dung trong đó).

### 3. Callout convention & màu

Custom `blockquote` renderer: lấy text content của children, nếu ký tự đầu (sau trim) là 1 trong các icon đã định nghĩa → render callout box màu tương ứng, icon giữ nguyên trong text:

| Icon | Loại | Màu |
|---|---|---|
| 💡 | tip | amber (`bg-amber-50 border-amber-400 text-amber-800`) |
| ℹ️ | note | blue (`bg-blue-50 border-blue-400 text-blue-800`) |
| ⚠️ | warning | orange (`bg-orange-50 border-orange-400 text-orange-800`) |
| ❗ | danger | rose (`bg-rose-50 border-rose-400 text-rose-800`) |
| ✅ | success | green (`bg-green-50 border-green-400 text-green-800`) |

Blockquote không có icon ở đầu → giữ style hiện tại (`border-l-2 border-orange-400 pl-3 text-xs text-slate-600 italic`).

### 4. Style mapping (`components` prop của `ReactMarkdown`)

| Element | Style |
|---|---|
| `h1` | `text-base font-display font-black text-slate-900 mt-3 mb-1` (giữ nguyên) |
| `h2` | `text-sm font-display font-bold text-slate-800 mt-3 mb-1` (giữ nguyên) |
| `h3`–`h6` | `text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5` (giữ nguyên style h3 cũ) |
| `p` | `text-xs text-slate-600 leading-relaxed` (giữ nguyên) |
| `strong` | `font-bold text-slate-900` (giữ nguyên) |
| `em` | mặc định `<em>` |
| `code` (inline) | `bg-slate-100 text-orange-700 font-mono text-[90%] px-1 py-0.5 rounded` (giữ nguyên) |
| `pre` (code block) | `bg-slate-900 text-slate-50 rounded-xl p-3 my-2 overflow-x-auto` |
| `pre code` | `font-mono text-[11px] leading-relaxed` (không style bg/padding trùng với `pre`) |
| `ul` | `list-disc list-outside ml-4 space-y-0.5 my-1` |
| `ol` | `list-decimal list-outside ml-4 space-y-0.5 my-1` |
| `li` (thường) | `text-xs text-slate-600 leading-relaxed` |
| `li` (task item, có checkbox) | ẩn bullet (`list-none -ml-4`), icon `CheckSquare`/`Square` (lucide, 12px) màu cam khi checked thay cho `<input type=checkbox>` native |
| `blockquote` | xem mục 3 |
| `table` | `w-full text-xs border-collapse` trong wrapper `overflow-x-auto my-2` (giữ nguyên) |
| `thead`/`th` | `border border-slate-200 bg-slate-100 px-2 py-1 text-left font-display font-bold text-slate-700` (giữ nguyên) |
| `td` | `border border-slate-200 px-2 py-1 text-slate-600` (giữ nguyên) |
| `hr` | `border-slate-200 my-2` (giữ nguyên) |
| `a` | `text-orange-600 underline hover:text-orange-700` |
| `img` | `rounded-lg max-w-full my-1` |

### 5. Testing / verification

- `npm run lint` (tsc --noEmit) phải pass.
- Test lại đúng nội dung thật đã dùng ở bug fix trước (bảng chữ cái tiếng Đức của lesson `a1-l1`) — phải render đúng như cũ (không regression).
- Test thêm nội dung mẫu bao phủ: checkbox (`- [ ] / - [x]`), nested list 2-3 cấp, code block ```` ```text ... ``` ````, callout với cả 5 icon, blockquote thường (không icon).
- Xác nhận qua trang test tạm (`mdtest.html`/`mdtest.tsx`, xoá sau khi xong) như lần trước, vì không thể login vào app thật để xem trực tiếp (bị chặn nhập password theo policy).

## Ngoài phạm vi (không làm)

- Syntax highlighting cho code block (cần thêm `rehype-highlight`/`prism` — không được yêu cầu).
- Giữ màu nền tuỳ chỉnh của callout Notion gốc (không lưu được trong markdown thuần) — dùng bộ màu cố định theo icon.
- Đổi field `grammar_md`/kiểu dữ liệu DB — không cần vì vẫn là `string`.
