// Tách riêng khỏi useExerciseSets.ts (không import supabase) vì import bất kỳ
// export nào từ một module sẽ chạy toàn bộ module đó — nếu để chung file với
// useExerciseSets.ts, test node:test sẽ crash lúc import do src/lib/supabase.ts
// đọc import.meta.env ở top-level, chỉ hoạt động trong môi trường Vite.

export function defaultSetTitleAt(index: number): string {
  return `Bài tập ${index + 1}`;
}

// existingCount = số set đã có trong lesson trước khi tạo set này — tên mặc
// định theo đúng số thứ tự hiển thị admin đang quen thấy ("Bài 1", "Bài 2"),
// không phụ thuộc order_index thực tế (có thể có khoảng trống sau khi xóa).
export function nextDefaultSetTitle(existingCount: number): string {
  return defaultSetTitleAt(existingCount);
}

export function planSetRenumber(
  sets: { id: string; orderIndex: number }[],
): { id: string; order_index: number; title: string }[] {
  return [...sets]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((set, index) => ({
      id: set.id,
      order_index: index,
      title: defaultSetTitleAt(index),
    }));
}
