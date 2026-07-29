# Lưu và truy xuất lại kết quả bài tập ngữ pháp

Ngày: 2026-07-29

## Bối cảnh

Học viên làm bài tập Grammatikübungen, submit và pass, màn hình hiện `Passed`.
Sau khi refresh hoặc rời lesson rồi quay lại, trang bài tập trở về form trắng:
không còn đáp án đã nhập, không còn điểm, không còn số lần làm.

## Nguyên nhân gốc

Dữ liệu chưa bao giờ được ghi, không phải bị reset.

1. **Không có nơi lưu attempt.** `grammar-submit` sau khi chấm chỉ ghi
   `lesson_progress.quiz_score` (`supabase/functions/grammar-submit/index.ts:83`).
   Bảng `lesson_progress` chỉ có `(user_id, lesson_id, category, completed_at,
   quiz_score)`. Các giá trị `blankResults` / `choiceResults` được tính ra, trả
   về client rồi vứt đi. Đáp án của học viên không được lưu ở đâu cả.

2. **Frontend giữ kết quả hoàn toàn trong React state.** `GrammarExercisePage`
   khởi tạo `result = null` và chỉ set trong `handleSubmit`. Không có effect nào
   đọc lại attempt cũ khi mount. Trang cũng không đọc
   `stats.quizScoresByCategory` (thứ *có* persist), nên điểm đã lưu cũng không
   hiển thị.

3. **XP cấp sai.** Điều kiện `passed && !existing` (`index.ts:78`): nếu attempt 1
   fail đã tạo row, attempt 2 pass sẽ không được XP.

4. **Upsert ghi đè bằng điểm mới nhất**, không phải điểm cao nhất. Làm lại bị
   điểm thấp sẽ xóa mất trạng thái pass ở Roadmap.

5. **Không thể hiện đáp án đúng khi xem lại.** View `grammar_exercises_public`
   cố tình ẩn `correct_answer` (đúng về bảo mật).

6. **Card kết quả chỉ render đáp án đã nhập cho 2/8 loại bài.**
   `fill_in_the_blank` và `multiple_choice` có màu đúng/sai; sáu loại còn lại
   (dịch, sửa câu sai, sắp xếp từ, biến đổi câu, viết câu gợi ý, phân loại) chỉ
   hiện đề bài + giải thích. Do `computeGrammarScore` không sinh boolean cho
   từng bài ở các loại đó.

## Quyết định thiết kế

| Quyết định | Chọn | Lý do |
|---|---|---|
| Mô hình lưu | Snapshot mới nhất + bộ đếm, 1 row/(user, lesson) | Gọn, mirror pattern `writing_submissions` bản đầu |
| UX khi mở lại | Vào thẳng card kết quả của attempt gần nhất | Khớp Expected Result; tái dùng khối `if (result)` sẵn có |
| Snapshot vs best_score | Snapshot luôn là lần gần nhất, hiển thị kèm `best_score` và `attempt_count` | Trung thực với lần vừa nộp, vẫn giữ đúng trạng thái pass |
| Đáp án đúng | Không gửi `correct_answer` về client | Khi pass 100%, đáp án học viên nhập chính là đáp án đúng |
| Gap 6/8 loại | Mở rộng scoring trả kết quả từng bài cho cả 8 loại | Không để lại trạng thái nửa vời trong cùng một trang |

## Kiến trúc

### 1. Tầng dữ liệu

Migration mới tạo bảng `grammar_attempts`:

```sql
CREATE TABLE grammar_attempts (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id        TEXT        NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers          JSONB       NOT NULL,
  blank_results    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  choice_results   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  exercise_results JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score            INTEGER     NOT NULL,
  total            INTEGER     NOT NULL,
  best_score       INTEGER     NOT NULL,
  attempt_count    INTEGER     NOT NULL DEFAULT 1,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);
```

`answers` lưu đúng payload `Record<exerciseId, answerString>` mà client gửi lên.

RLS bật, với đúng hai policy:

- `grammar_attempts: own read` — `FOR SELECT TO authenticated USING (user_id = auth.uid())`
- `grammar_attempts: admin all` — `FOR ALL` theo `app_metadata.role = 'admin'`

**Không có policy INSERT/UPDATE cho `authenticated`.** Chỉ `grammar-submit`
(service_role) được ghi. Nếu học viên tự ghi được thì họ tự đặt `best_score = 100`.

Bảng này không chứa `correct_answer`, nên client đọc trực tiếp qua PostgREST là
an toàn — không cần Edge Function riêng để đọc.

`lesson_progress.quiz_score` giữ nguyên vai trò cũ (nguồn cho Roadmap /
Dashboard / `useUserStats`), không đổi schema.

### 2. Edge Function `grammar-submit`

`scoring.ts` — `computeGrammarScore` trả thêm `exerciseResults: Record<string, boolean>`:

- `multiple_choice`, `fill_in_the_blank`: giữ nguyên `choiceResults` /
  `blankResults` như hiện tại, đồng thời điền `exerciseResults[id]` = đúng toàn bộ bài.
- `classification`: chấm **từng item**, nhất quán với cách `total` đang cộng theo
  số item. `exerciseResults[id]` = đúng toàn bộ item.
- Các loại text (`word_reorder`, `error_correction`, `translation`,
  `sentence_transformation`, `guided_sentence_writing`): `exerciseResults[id]` =
  kết quả so khớp đã có sẵn trong vòng lặp.

`exerciseResults` phải nhất quán với `correct` / `total` đang tính.

Tách quyết định persist ra thành hàm thuần để test được:

```ts
computeAttemptUpdate(existing, score) -> { best_score, attempt_count, xp_earned }
```

- `best_score = max(score, existing?.best_score ?? 0)`
- `attempt_count = (existing?.attempt_count ?? 0) + 1`
- `xp_earned = XP_REWARD` khi `score >= PASS_THRESHOLD && (existing?.best_score ?? 0) < PASS_THRESHOLD`, ngược lại `0`

Luồng handler sau khi chấm:

1. Đọc row `grammar_attempts` của `(user_id, lesson_id)`.
2. Gọi `computeAttemptUpdate`.
3. Upsert `grammar_attempts` — snapshot lần này (`answers`, `blank_results`,
   `choice_results`, `exercise_results`, `score`, `total`) + `best_score` + `attempt_count`.
4. Upsert `lesson_progress.quiz_score = best_score` (đổi từ `score`).
5. Cấp XP nếu `xp_earned > 0`.
6. Response bổ sung `best_score`, `attempt_count`, `exerciseResults`.

Bước 3 và 4 là hai lệnh ghi riêng, không có transaction qua PostgREST. Chấp nhận
rủi ro: nếu bước 4 lỗi thì attempt đã lưu nhưng Roadmap chậm một nhịp, và lần
submit sau tự chữa. Gom vào RPC plpgsql sẽ atomic nhưng thêm một lớp abstraction
cho thứ hiếm khi hỏng.

### 3. Frontend

**`src/lib/grammarAnswerCodec.ts`** — `serializeAnswer` / `parseAnswer` cho cả 8
loại. `serializeAnswer` thay thế logic đang nội tuyến trong
`GrammarExercisePage.getAnswerStringFor` (dòng 307-329); `parseAnswer` là nghịch
đảo, dùng khi hydrate:

- `fill_in_the_blank` → `JSON.parse` ra `string[]` → `blankAnswersByExercise`
- `multiple_choice` → `Number` → `choiceByExercise`
- `classification` → tách `"item:group|item:group"` → `itemGroupsByExercise`
- các loại text → `textAnswerByExercise`
- `word_reorder` → chuỗi đã ghép; **không** khôi phục `selectedTokensByExercise`
  vì index token gốc đã mất. Chỉ dùng để hiển thị trong card kết quả.

Input hỏng phải parse ra giá trị rỗng an toàn, không ném lỗi.

**`src/lib/hooks/useGrammarAttempt.ts`** — mirror `useGrammarExercises`: select
row `grammar_attempts` theo `lessonId`, trả `{ attempt, loading }`. Một query,
RLS lo phần lọc theo user.

**`GrammarExercisePage`**:

- Khi `attempt` về, dựng `result` từ nó và nạp lại các state đáp án qua `parseAnswer`.
- Thêm cờ `retrying` để effect hydrate không nạp đè lên form vừa được
  `handleRetry` xóa trắng. `handleRetry` giữ nguyên hành vi còn lại.
- Card kết quả thêm một dòng dưới khối điểm:
  `Điểm cao nhất: {best_score}% · Đã làm {attempt_count} lần`.
- Khi `best_score >= 80` mà `score < 80`: giữ nguyên mặt 😟 và badge "Chưa đạt
  chuẩn 80%" — phản ánh trung thực lần vừa nộp; dòng "Điểm cao nhất" bên cạnh
  cho biết bài vẫn đã pass.
- Card kết quả render đáp án đã nhập cho **cả 8 loại**, tô xanh/đỏ theo
  `exerciseResults`. `fill_in_the_blank` và `multiple_choice` giữ cách render
  chi tiết hiện có (theo từng blank / từng option).

Không đụng `useUserStats`, `completion.ts`, Roadmap, Dashboard — chúng đọc
`lesson_progress.quiz_score`, giờ chứa `best_score`, nên tự đúng.

## Kiểm thử

Repo dùng `node:test` + `tsx`, không có npm script test. Theo đúng convention đó.

**Unit test:**

- `src/lib/grammarAnswerCodec.test.ts` — round-trip `serialize(parse(x)) === x`
  cho cả 8 loại; input hỏng (JSON lỗi ở `fill_in_the_blank`, index không phải số
  ở `multiple_choice`, chuỗi classification thiếu dấu `:`) trả giá trị rỗng an
  toàn. Đây là test quan trọng nhất — codec sai thì đáp án hydrate ra sai, đúng
  cái bug đang sửa.
- `supabase/functions/grammar-submit/scoring.test.ts` — bổ sung case cho
  `exerciseResults`: mỗi loại đúng/sai, classification chấm từng item,
  `exerciseResults` nhất quán với `correct` / `total`.
- Test cho `computeAttemptUpdate`: chưa có attempt + pass → có XP; fail rồi pass
  → có XP (bug hiện tại); pass rồi pass lại → không XP; pass 90 rồi được 50 →
  `best_score` vẫn 90, `attempt_count` = 2.

**Kiểm thử thủ công** theo Steps to Reproduce của bug report: làm bài → pass →
refresh → thấy card kết quả; bấm "Làm lại" → form trắng; nộp lần 2 điểm thấp →
refresh → thấy điểm lần 2 + "Điểm cao nhất" + "2 lần"; Roadmap vẫn hiển thị đã
hoàn thành.

Sau cùng: `npm run lint`, và `npm run gen:types` vì có thay đổi schema.

## Ngoài scope

- `useUserStats`, `completion.ts`, Roadmap, Dashboard
- View `grammar_exercises_public`
- Bảng `writing_submissions`
- Không thêm npm package

**Việc nối tiếp, không làm lần này:** `quiz-submit` (category `nghe` / `doc`) có
đúng cùng bug — cũng chỉ lưu `quiz_score`, cũng có lỗi `passed && !existing`.
Sửa luôn sẽ làm phình scope và cần thiết kế UI riêng cho hai trang đó.
