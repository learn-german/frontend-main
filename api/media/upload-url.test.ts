import assert from "node:assert/strict";
import { buildObjectKey, isAllowedExt, sanitizeFileName } from "./upload-url";

// --- sanitizeFileName ---
assert.equal(sanitizeFileName("audio_19_3.mp3"), "audio_19_3");
assert.equal(sanitizeFileName("audio_6_2"), "audio_6_2");                 // không có đuôi
assert.equal(sanitizeFileName("audio.6.2.mp3"), "audio.6.2");             // chỉ cắt đuôi cuối
assert.equal(sanitizeFileName("C:\\Users\\me\\audio_8_1.mp3"), "audio_8_1"); // bỏ đường dẫn Windows
assert.equal(sanitizeFileName("/tmp/audio_12_3.mp3"), "audio_12_3");      // bỏ đường dẫn POSIX
assert.equal(sanitizeFileName("bài nghe 1.mp3"), "b_i_nghe_1");           // ký tự lạ -> _
assert.equal(sanitizeFileName("a/../../etc/passwd.mp3"), "passwd");       // không thoát được thư mục
assert.equal(sanitizeFileName("x".repeat(150) + ".mp3").length, 100);     // cắt tối đa 100
assert.equal(sanitizeFileName(undefined), "");
assert.equal(sanitizeFileName(""), "");
assert.equal(sanitizeFileName(".mp3"), "");                               // chỉ có đuôi
assert.equal(sanitizeFileName("音声.mp3"), "");                            // không còn ký tự dùng được

// --- buildObjectKey: audio ---
assert.equal(
  buildObjectKey("audio", "lesson-1", "MP3", "clip-1", undefined, "audio_19_3.mp3"),
  "audio/lesson-1/clip-1/audio_19_3.mp3",
);
// Trùng tên nhưng khác clip -> khác key, không đè nhau
assert.notEqual(
  buildObjectKey("audio", "lesson-1", "mp3", "clip-1", undefined, "audio_19_3.mp3"),
  buildObjectKey("audio", "lesson-1", "mp3", "clip-2", undefined, "audio_19_3.mp3"),
);
// Không có tên file (client cũ) hoặc tên không dùng được -> key phẳng như trước
assert.equal(buildObjectKey("audio", "lesson-1", "mp3", "clip-1"), "audio/lesson-1/clip-1.mp3");
assert.equal(
  buildObjectKey("audio", "lesson-1", "mp3", "clip-1", undefined, "音声.mp3"),
  "audio/lesson-1/clip-1.mp3",
);

// --- buildObjectKey: video/image không đổi ---
assert.equal(buildObjectKey("video", "lesson-1", "MP4"), "videos/lesson-1.mp4");
assert.equal(
  buildObjectKey("image", "lesson-1", "PNG", undefined, "rand-1", "anh.png"),
  "images/lesson-1/rand-1.png",
);

// --- isAllowedExt giữ nguyên hành vi ---
assert.equal(isAllowedExt("audio", "MP3"), true);
assert.equal(isAllowedExt("audio", "ogg"), false);

console.log("upload-url.test.ts OK");
