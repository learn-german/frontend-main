# Grammar table cell line break — Design Spec

**Date:** 2026-09-16  
**Status:** Approved  
**Scope:** Admin editor ngữ pháp (`grammar_md`) + render bảng markdown dùng chung (`MarkdownBlock`). Không đổi DB, CSS wrap, hay editor speaking/vocab/writing.

## Problem

Admin không thể nhấn Enter để xuống dòng **trong một ô** bảng markdown. GFM bắt mỗi hàng bảng nằm trên một dòng vật lý, nên Enter thường phá hàng. Renderer hiện chỉ biến đúng chuỗi `<br/>` thành dòng mới; `<br>` và `<br />` (cú pháp người soạn hay tìm) hiện thành text literal.

Lần sửa CSS (`break-words`, `table-auto`) không giải quyết Enter-trong-ô.

## Goal

Trong textarea ngữ pháp, Enter khi con trỏ đang ở trong ô bảng chèn xuống dòng trong **đúng ô đó**. Preview admin và trang học viên đều hiện dòng mới.

## Decisions

1. **Hướng 1:** Enter trong ô chèn `<br/>`, tái dùng `splitBrText`. Không làm editor bảng visual.
2. **Shift+Enter:** không chặn — xuống dòng markdown thật (cửa thoát).
3. **Hết dòng / ngoài bảng / hàng `---`:** Enter bình thường.
4. **Không** tự thêm hàng bảng `|  |  |`.
5. **Không** đổi `table-fixed` / wrap (đó là auto-wrap, không phải yêu cầu này).
6. Intercept chỉ textarea `grammar_md`. `splitBrText` dùng chung mọi bảng markdown — nới matcher là additive.

## Architecture

Không đổi schema, RLS, Edge Function.

Hai thay đổi thuần:

1. Helper bàn phím trong `src/lib/markdownTable.ts` (cùng file với `mergeMultilineTableRows` / `splitBrText`).
2. `onKeyDown` trên textarea ngữ pháp trong `AdminLessonEditor.tsx`.

Luồng:

```
Admin Enter trong ô
  → markdownTableEnter(value, start, end)
  → chèn "<br/>", giữ hàng | ... |
  → lưu grammar_md
MarkdownBlock.preprocessMarkdown + splitBrText
  → <br> thật trong td/th
  → admin preview + LessonDetailPage (user)
```

Paste Notion (hàng chưa đóng `|`) vẫn do `mergeMultilineTableRows` xử lý — không đổi.

## Helper

```ts
export function markdownTableEnter(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; cursor: number } | null
```

Trả `null` (không intercept) khi:

- Selection vượt quá một dòng
- Dòng hiện tại không bắt đầu bằng `|` (sau trim trái)
- Dòng là separator (`| --- | --- |`, `|---|`, alignment `:---:`)
- Con trỏ không nằm giữa hai dấu `|` (hết hàng sau `|` cuối → Enter bình thường)

Ngược lại: thay selection bằng `"<br/>"`, `cursor` = vị trí sau marker.

`isInsideMarkdownTableCell(line, col)` có thể là helper nội bộ hoặc export để test.

IME: `onKeyDown` bỏ qua khi `e.nativeEvent.isComposing` hoặc `e.shiftKey`.

## Render

`splitBrText` tách mọi biến thể `<br>`, `<br/>`, `<br />` (case-insensitive), không chỉ `"<br/>"`.

Không thêm `rehype-raw`. Không package mới.

## Admin UI

`AdminLessonEditor.tsx` — textarea ngữ pháp:

- `onKeyDown`: nếu `markdownTableEnter` khác `null` → `preventDefault`, `upd({ grammar_md })`, đặt lại caret (controlled textarea).
- Hint thêm một câu tiếng Việt: trong bảng, Enter xuống dòng trong ô; Shift+Enter xuống dòng markdown.

Không đụng textarea speaking / writing / vocab.

## Test

Mở rộng `src/lib/markdownTable.test.ts`:

- Trong ô → chèn `<br/>`, caret sau marker
- Hết hàng / prose / separator / selection nhiều dòng → `null`
- `splitBrText` nhận `<br>`, `<br />`, `<BR/>`

Không cần test render `AdminLessonEditor` nếu helper cover nhánh.

## Out of scope

- `table-fixed` / auto-wrap chữ dài
- Intercept Enter ở editor markdown khác
- Tự tạo hàng bảng mới
- `rehype-raw` / HTML tùy ý trong markdown

## Worktree

- Branch: `fix/grammar-table-cell-line-break`
- Path: `.worktrees/fix-grammar-table-cell-line-break`
