import assert from "node:assert/strict";
import {
  applicableCategories,
  isLessonComplete,
  computeCompletedLessons,
  type LessonQuizFlags,
} from "./completion";

// Chỉ có câu hỏi ngữ pháp -> chỉ mục ngữ pháp bắt buộc
assert.deepEqual(
  applicableCategories({ id: "l1", hasNguphapQuestions: true }),
  ["nguphap"],
);

// Đủ cả ba mục
assert.deepEqual(
  applicableCategories({
    id: "l2",
    hasNguphapQuestions: true,
    hasNgheQuestions: true,
    hasDocQuestions: true,
  }),
  ["nguphap", "nghe", "doc"],
);

// Không có câu hỏi ở mục nào -> không mục nào bắt buộc
assert.deepEqual(applicableCategories({ id: "l3" }), []);

// Cờ undefined coi như không có câu hỏi (KHÔNG coi là "có")
assert.deepEqual(
  applicableCategories({ id: "l4", hasNguphapQuestions: undefined, hasNgheQuestions: true }),
  ["nghe"],
);

// Cờ false cũng là không có câu hỏi
assert.deepEqual(
  applicableCategories({ id: "l5", hasNguphapQuestions: false, hasDocQuestions: true }),
  ["doc"],
);

// Bài chỉ có ngữ pháp, đạt 80 -> hoàn thành
assert.equal(
  isLessonComplete({ id: "l1", hasNguphapQuestions: true }, { nguphap: 80 }),
  true,
);

// Đạt 79 -> chưa hoàn thành
assert.equal(
  isLessonComplete({ id: "l1", hasNguphapQuestions: true }, { nguphap: 79 }),
  false,
);

// Bài không có câu hỏi ở mục nào -> hoàn thành ngay
assert.equal(isLessonComplete({ id: "l3" }, {}), true);

// Có câu hỏi nghe nhưng chưa làm -> chưa hoàn thành
assert.equal(
  isLessonComplete(
    { id: "l2", hasNguphapQuestions: true, hasNgheQuestions: true },
    { nguphap: 100 },
  ),
  false,
);

// BUG ĐÃ BÁO: bài có file nghe nhưng KHÔNG có câu hỏi nghe.
// Cờ hasNgheQuestions là false -> mục nghe không bắt buộc -> xong ngữ pháp là hoàn thành.
const lessonWithClipButNoQuestions: LessonQuizFlags = {
  id: "l6",
  hasNguphapQuestions: true,
  hasNgheQuestions: false,
  hasDocQuestions: false,
};
assert.equal(isLessonComplete(lessonWithClipButNoQuestions, { nguphap: 90 }), true);

// computeCompletedLessons trên nhiều bài
assert.deepEqual(
  computeCompletedLessons(
    [
      { id: "l1", hasNguphapQuestions: true },
      { id: "l2", hasNguphapQuestions: true, hasNgheQuestions: true },
      { id: "l3" },
    ],
    [
      { lesson_id: "l1", category: "nguphap", quiz_score: 85 },
      { lesson_id: "l2", category: "nguphap", quiz_score: 85 },
    ],
  ),
  ["l1", "l3"],
);

// Row quiz_score null bị bỏ qua
assert.deepEqual(
  computeCompletedLessons(
    [{ id: "l1", hasNguphapQuestions: true }],
    [{ lesson_id: "l1", category: "nguphap", quiz_score: null }],
  ),
  [],
);

console.log("completion.test.ts OK");
