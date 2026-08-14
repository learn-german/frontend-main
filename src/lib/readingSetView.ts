export type ReadingQuestionType = "richtig_falsch" | "multiple_choice";

export const READING_QUESTION_TYPES: readonly ReadingQuestionType[] = ["multiple_choice", "richtig_falsch"];

interface PassageLite {
  set_id: string | null;
  order_index: number;
}

interface GroupOrderLite {
  passage_id: string;
  order_index: number;
}

interface GroupCountLite {
  question_type: ReadingQuestionType;
  statements: unknown[] | null;
  sub_questions: unknown[] | null;
}

interface GroupTypeLite {
  passage_id: string;
  question_type: ReadingQuestionType;
}

export function itemCount(group: GroupCountLite): number {
  return group.question_type === "richtig_falsch" ? (group.statements ?? []).length : (group.sub_questions ?? []).length;
}

export function passagesForSet<T extends PassageLite>(passages: T[], setId: string): T[] {
  return passages.filter((p) => p.set_id === setId).sort((a, b) => a.order_index - b.order_index);
}

export function groupsForPassage<T extends GroupOrderLite>(groups: T[], passageId: string): T[] {
  return groups.filter((g) => g.passage_id === passageId).sort((a, b) => a.order_index - b.order_index);
}

export function missingQuestionTypesForPassage(groups: GroupTypeLite[], passageId: string): ReadingQuestionType[] {
  return READING_QUESTION_TYPES.filter((qt) => !groups.some((g) => g.passage_id === passageId && g.question_type === qt));
}

export interface ReadingSetStats {
  passageCount: number;
  typeCount: number;
  questionCount: number;
}

export function readingSetStats(
  passages: { set_id: string | null }[],
  groups: (GroupCountLite & { set_id: string })[],
  setId: string,
): ReadingSetStats {
  const setGroups = groups.filter((g) => g.set_id === setId);
  return {
    passageCount: passages.filter((p) => p.set_id === setId).length,
    typeCount: setGroups.length,
    questionCount: setGroups.reduce((sum, g) => sum + itemCount(g), 0),
  };
}

export interface GroupSetLite {
  id: string;
  set_id: string;
  title: string | null;
}

export function groupsForSet<T extends GroupSetLite>(groups: T[], setId: string): T[] {
  return groups.filter((g) => g.set_id === setId);
}

// "Nhóm có tiêu đề" phải là nhóm DUY NHẤT trong set — set đã có nhóm khác
// (dù có tiêu đề hay không) thì không được thêm/gắn tiêu đề nữa, và
// ngược lại một set đã "khoá" bởi 1 nhóm có tiêu đề thì không nhận thêm
// nhóm nào khác. excludeGroupId dùng khi validate SỬA 1 nhóm đã có sẵn
// (loại chính nó ra khỏi danh sách "nhóm khác" khi so sánh); null khi
// đang tạo nhóm mới (không có gì để loại trừ).
export function canGroupHaveTitle(groupsInSet: GroupSetLite[], excludeGroupId: string | null): boolean {
  return groupsInSet.every((g) => g.id === excludeGroupId);
}

export function canAddGroupToSet(groupsInSet: GroupSetLite[]): boolean {
  return !groupsInSet.some((g) => !!g.title?.trim());
}
