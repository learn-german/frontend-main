import type { ReadingQuestionGroupPublic, ReadingPassageLite } from "./hooks/useReadingQuestionGroups";
import { getReadingSetLayout, type ReadingSetLayout } from "./readingSetView";

const INVALID_STRUCTURE = "Cấu trúc bài đọc chưa hợp lệ. Vui lòng liên hệ admin.";

export type ReadingCarouselScreen =
  | {
      kind: "multi_passage";
      passageId: string;
      groupId: string;
      slideIndex: number;
      slideCount: number;
      key: string;
    }
  | {
      kind: "single_mc";
      passageId: string;
      groupId: string;
      questionIndex: number;
      slideIndex: number;
      slideCount: number;
      key: string;
    }
  | {
      kind: "single_rf_summary";
      passageId: string;
      items: { key: string; text: string }[];
      slideIndex: number;
      slideCount: number;
    };

export type BuildReadingCarouselResult =
  | { ok: true; layout: ReadingSetLayout; screens: ReadingCarouselScreen[] }
  | { ok: false; error: string };

export const itemKey = (groupId: string, index: number): string => `${groupId}:${index}`;

function sortGroups(
  groups: ReadingQuestionGroupPublic[],
  passagesById: Record<string, ReadingPassageLite>,
): ReadingQuestionGroupPublic[] {
  return [...groups].sort((a, b) => {
    const pa = passagesById[a.passageId]?.orderIndex ?? 0;
    const pb = passagesById[b.passageId]?.orderIndex ?? 0;
    if (pa !== pb) return pa - pb;
    return a.orderIndex - b.orderIndex;
  });
}

function validateMultiPassage(groups: ReadingQuestionGroupPublic[], passageCount: number): boolean {
  const passageIds = new Set(groups.map((g) => g.passageId));
  if (passageIds.size !== passageCount) return false;

  for (const passageId of passageIds) {
    const passageGroups = groups.filter((g) => g.passageId === passageId);
    if (passageGroups.length !== 1) return false;
    const group = passageGroups[0];
    if (group.questionType !== "multiple_choice") return false;
    if (group.subQuestions.length !== 1) return false;
  }
  return true;
}

function validateSinglePassage(groups: ReadingQuestionGroupPublic[]): boolean {
  const passageIds = new Set(groups.map((g) => g.passageId));
  return passageIds.size <= 1;
}

function buildMultiPassageScreens(sortedGroups: ReadingQuestionGroupPublic[]): ReadingCarouselScreen[] {
  const slideCount = sortedGroups.length;
  return sortedGroups.map((group, slideIndex) => ({
    kind: "multi_passage" as const,
    passageId: group.passageId,
    groupId: group.id,
    slideIndex,
    slideCount,
    key: itemKey(group.id, 0),
  }));
}

function buildSinglePassageScreens(sortedGroups: ReadingQuestionGroupPublic[]): ReadingCarouselScreen[] {
  const passageId = sortedGroups[0]?.passageId ?? "";
  const screens: ReadingCarouselScreen[] = [];

  for (const group of sortedGroups) {
    if (group.questionType === "multiple_choice") {
      for (let i = 0; i < group.subQuestions.length; i++) {
        screens.push({
          kind: "single_mc",
          passageId: group.passageId,
          groupId: group.id,
          questionIndex: i,
          slideIndex: 0,
          slideCount: 0,
          key: itemKey(group.id, i),
        });
      }
    }
  }

  const rfItems: { key: string; text: string }[] = [];
  for (const group of sortedGroups) {
    if (group.questionType === "richtig_falsch") {
      for (let i = 0; i < group.statements.length; i++) {
        rfItems.push({
          key: itemKey(group.id, i),
          text: group.statements[i].text,
        });
      }
    }
  }

  if (rfItems.length > 0) {
    screens.push({
      kind: "single_rf_summary",
      passageId,
      items: rfItems,
      slideIndex: 0,
      slideCount: 0,
    });
  }

  const slideCount = screens.length;
  return screens.map((screen, slideIndex) => ({ ...screen, slideIndex, slideCount }));
}

export function buildReadingCarouselScreens(
  groups: ReadingQuestionGroupPublic[],
  passagesById: Record<string, ReadingPassageLite>,
  passageCount: number,
): BuildReadingCarouselResult {
  if (passageCount < 1) {
    return { ok: false, error: INVALID_STRUCTURE };
  }

  const layout = getReadingSetLayout(passageCount);
  const sortedGroups = sortGroups(groups, passagesById);

  if (layout === "multi_passage") {
    if (!validateMultiPassage(sortedGroups, passageCount)) {
      return { ok: false, error: INVALID_STRUCTURE };
    }
    return { ok: true, layout, screens: buildMultiPassageScreens(sortedGroups) };
  }

  if (!validateSinglePassage(sortedGroups)) {
    return { ok: false, error: INVALID_STRUCTURE };
  }

  return { ok: true, layout, screens: buildSinglePassageScreens(sortedGroups) };
}
