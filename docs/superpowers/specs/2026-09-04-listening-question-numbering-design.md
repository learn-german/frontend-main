# Listening Question Numbering — Design Spec

**Date**: 2026-09-04  
**Status**: Approved  
**Scope**: Learner tab Nghe only (`QuizSetListPage` khi `isListening`). Không đổi ngữ pháp / đọc / admin.

## Overview

Trên bài nghe, số câu đang hiện dạng hierarchical `1.1`, `1.2`, … (cùng pattern ngữ pháp). Learner muốn số thứ tự đơn giản trong mỗi nhóm: `1`, `2`, `3`, …

## Decision

Trong mỗi nhóm (Bài N), đánh số lại từ 1. Nhiều nhóm → mỗi nhóm độc lập: Bài 1 → 1, 2, 3; Bài 2 → 1, 2, 3.

## Approach

Listening-only branch trong `QuizSetListPage`: khi `isListening`, `numberLabel = String(childIndex + 1)`; ngược lại giữ `${groupIndex + 1}.${childIndex + 1}`.

## Behavior

| Surface | Listening (new) | Grammar (unchanged) |
|---|---|---|
| Làm bài (`ExerciseAnswerInput`) | `1`, `2`, `3`… per group | `1.1`, `1.2`… |
| Kết quả (`ExerciseResultReview`) | same as làm bài | hierarchical |

Admin preview listening đã dùng `String(i + 1)` — không đổi.

## Files

- `src/pages/QuizSetListPage.tsx` — 2 chỗ gán `numberLabel` (làm bài + kết quả)

## Out of scope

- Scoring / Edge Functions / DB
- `ExerciseAnswerInput` / `ExerciseResultReview` API
- `promptText` content (nếu admin gõ sẵn `1.` trong câu — đó là nội dung, không phải label app)
- Grammar / reading numbering

## Verification

- Set nghe 1 nhóm, N câu → label `1…N` (không còn `1.1`)
- Set nghe 2 nhóm → mỗi nhóm lại từ `1`
- Ngữ pháp vẫn `1.1`, `1.2`
