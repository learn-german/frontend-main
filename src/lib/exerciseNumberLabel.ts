export function formatExerciseNumberLabel(opts: {
  isListening: boolean;
  groupIndex: number;
  childIndex: number;
}): string {
  if (opts.isListening) {
    return String(opts.childIndex + 1);
  }
  return `${opts.groupIndex + 1}.${opts.childIndex + 1}`;
}
