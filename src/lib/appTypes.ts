export type Level = "A1" | "A2" | "B1" | "B2";

export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
  quizScoresByCategory: Record<string, Partial<Record<"nguphap" | "nghe" | "doc", number>>>;
  unlockedLevels: Level[];
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
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  audioClipId?: string;
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
  grammarMd?: string;
  speakingMd?: string;
  videoR2Key?: string;
  listeningClips: { id: string; r2Key: string }[];
  readingText?: string;
  readingTextVi?: string;
  quiz?: QuizQuestion[];
  status?: "draft" | "published";
}

export interface Module {
  id: string;
  level: Level;
  title: string;
  titleVi: string;
  lessons: Lesson[];
}

export interface LessonPosition {
  id: string;
  moduleId: string;
  orderIndex: number;
  status: "draft" | "published";
}

export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard";
}
