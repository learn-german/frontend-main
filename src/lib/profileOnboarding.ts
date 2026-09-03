export function needsProfileOnboarding(fullName: string | null | undefined): boolean {
  return !fullName?.trim();
}

export type DisplayNameResult =
  | { value: string; error: null }
  | { value: null; error: string };

export function validateDisplayName(input: string): DisplayNameResult {
  const value = input.trim();
  if (!value) return { value: null, error: "Vui lòng nhập tên hiển thị." };
  if (value.length < 2 || value.length > 80) {
    return { value: null, error: "Tên hiển thị phải có từ 2 đến 80 ký tự." };
  }
  return { value, error: null };
}
