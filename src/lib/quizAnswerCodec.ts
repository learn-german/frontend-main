/** Ghép các ô trống text_fill_blank thành 1 chuỗi gửi lên server, theo thứ tự. */
export function joinBlankAnswers(values: string[]): string {
  return values.map((v) => v.trim()).join("|");
}

/** Tách chuỗi đáp án đã lưu (draft/attempt) thành mảng theo đúng số ô trống. */
export function splitBlankAnswers(raw: string, count: number): string[] {
  if (!raw) return Array(count).fill("");
  const parts = raw.split("|");
  return Array.from({ length: count }, (_, i) => parts[i] ?? "");
}

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

/** Đếm số ô {{...}} trong prompt_text của text_fill_blank — khớp đúng nhóm
 * bất kỳ nội dung (đáp án nằm trong ngoặc, vd "{{bin|Bin}}"), cùng quy ước
 * BLANK_PATTERN đang dùng để chấm điểm ở grammar-submit/scoring.ts. */
export function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{[^}]*\}\}/g) ?? []).length;
}
