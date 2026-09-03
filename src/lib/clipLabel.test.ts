import assert from "node:assert/strict";
import { clipLabel } from "./clipLabel";

const clipId = "9f2a1c3e-0000-4000-8000-000000000001";

// Key mới: hiện tên file gốc, bỏ phần mở rộng
assert.equal(
  clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}/audio_19_3.mp3` }, 0),
  "audio_19_3",
);
assert.equal(
  clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}/audio_6_2.m4a` }, 4),
  "audio_6_2",
);

// Tên có nhiều dấu chấm: chỉ cắt phần mở rộng cuối
assert.equal(
  clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}/audio.6.2.mp3` }, 0),
  "audio.6.2",
);

// Key cũ (phẳng theo clipId) không còn tên gốc -> nhãn thứ tự
assert.equal(clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}.mp3` }, 0), "File 1");
assert.equal(clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}.mp3` }, 1), "File 2");

// Key của clip khác (id không khớp) cũng phải fallback, không cắt bừa
assert.equal(
  clipLabel({ id: clipId, r2_key: "audio/lesson-1/other-clip-id/audio_19_3.mp3" }, 2),
  "File 3",
);

// Key rỗng hoặc lạ -> fallback
assert.equal(clipLabel({ id: clipId, r2_key: "" }, 0), "File 1");
assert.equal(clipLabel({ id: clipId, r2_key: `audio/lesson-1/${clipId}/` }, 6), "File 7");

console.log("clipLabel.test.ts OK");
