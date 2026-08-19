/**
 * Nhãn hiển thị của một file mp3 trong admin: tên file gốc lúc upload
 * (key dạng `audio/{lessonId}/{clipId}/{tên}.mp3`). Clip upload trước khi
 * tính năng này có (key phẳng `audio/{lessonId}/{clipId}.mp3`) không còn tên
 * gốc nên quay về nhãn thứ tự "File N".
 */
export function clipLabel(clip: { id: string; r2_key: string }, index: number): string {
  const marker = `/${clip.id}/`;
  const at = clip.r2_key.indexOf(marker);
  if (at === -1) return `File ${index + 1}`;
  const name = clip.r2_key.slice(at + marker.length).replace(/\.[^.]+$/, "");
  return name || `File ${index + 1}`;
}
