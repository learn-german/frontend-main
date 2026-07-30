import React, { useState } from "react";
import { Lesson } from "../lib/appTypes";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { GrammarSetListPage } from "./GrammarSetListPage";
import { GrammarExercisePage } from "./GrammarExercisePage";

interface GrammarExerciseFlowProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

// setId đang làm là state cục bộ, KHÔNG đồng bộ vào URL global — quyết định
// đã chốt (xem docs/superpowers/plans/2026-07-30-grammar-pass-reveal-implementation.md):
// F5 giữa chừng quay về danh sách set, đổi lại giữ App.tsx/router.ts nguyên
// vẹn (vừa ổn định qua nhiều commit sửa lỗi routing gần đây).
export const GrammarExerciseFlow: React.FC<GrammarExerciseFlowProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome: _onNavigateHome,
  onNextLesson: _onNextLesson,
  onBackToLesson,
}) => {
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const { sets } = useExerciseSets();
  const activeSet = sets.find((s) => s.id === activeSetId);

  if (activeSetId && activeSet) {
    return (
      <GrammarExercisePage
        key={activeSetId}
        lessonId={lesson.id}
        set={{ id: activeSet.id, title: activeSet.title }}
        onSetFinished={onQuizFinished}
        onBackToList={() => setActiveSetId(null)}
        onBackToLesson={onBackToLesson}
      />
    );
  }

  return (
    <GrammarSetListPage
      lessonId={lesson.id}
      onBackToLesson={onBackToLesson}
      onSelectSet={setActiveSetId}
    />
  );
};
