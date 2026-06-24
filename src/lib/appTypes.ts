export type Level = "A1" | "A2" | "B1";

export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
}

export interface VocabularyItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

export interface GrammarExample {
  de: string;
  vi: string;
}

export interface GrammarExplanation {
  title: string;
  rule: string;
  examples: GrammarExample[];
}

export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  questionText: string;
  audioText?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}

export interface Lesson {
  id: string;
  moduleId?: string;
  moduleTitle: string;
  level: Level;
  title: string;
  titleVi: string;
  duration: string;
  objective: string;
  summary: string;
  youtubeId?: string;
  orderIndex?: number;
  nextLessonId?: string | null;
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  quiz: QuizQuestion[];
}

export interface Module {
  id: string;
  level: Level;
  title: string;
  titleVi: string;
  lessons: Lesson[];
}

export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz";
}
