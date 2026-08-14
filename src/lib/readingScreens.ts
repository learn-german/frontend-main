import type { ReadingQuestionGroupPublic, ReadingPassageLite } from "./hooks/useReadingQuestionGroups";

export interface ReadingScreen {
  passageId: string;
  group: ReadingQuestionGroupPublic;
  questionIndex: number;
  questionCount: number;
  key: string;
}

export const itemKey = (groupId: string, index: number): string => `${groupId}:${index}`;

export function buildReadingScreens(
  groups: ReadingQuestionGroupPublic[],
  passagesById: Record<string, ReadingPassageLite>,
): ReadingScreen[] {
  const orderedGroups = [...groups].sort((a, b) => {
    const pa = passagesById[a.passageId]?.orderIndex ?? 0;
    const pb = passagesById[b.passageId]?.orderIndex ?? 0;
    return pa - pb;
  });

  return orderedGroups.flatMap((group) => {
    const count = group.questionType === "richtig_falsch" ? group.statements.length : group.subQuestions.length;
    return Array.from({ length: count }, (_, i) => ({
      passageId: group.passageId,
      group,
      questionIndex: i,
      questionCount: count,
      key: itemKey(group.id, i),
    }));
  });
}
