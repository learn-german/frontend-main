/** Ghép các cặp đã ghép đúng thành chuỗi gửi lên server — sort theo "de" để ổn định (khớp normalizeMatching phía grammar-submit dù thứ tự có khác cũng vẫn chấm đúng, sort chỉ để debug dễ đọc). */
export function serializeMatching(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([de, vi]) => `${de}:${vi}`)
    .join("|");
}

/** Tách chuỗi đáp án matching đã lưu thành map de -> vi. */
export function parseMatching(raw: string): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const pair of raw.split("|")) {
    const [de, vi] = pair.split(":");
    if (de && vi) result[de] = vi;
  }
  return result;
}
