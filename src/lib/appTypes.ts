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
  answerText?: string;
  audioText?: string;
  audioClipId?: string;
  readingPassageId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}

export interface GrammarExercise {
  id: string;
  lessonId: string;
  orderIndex: number;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank";
  groupId?: string;
  hint?: string;
  promptText?: string;
  transformationHint?: string;
  tokens?: string[];
  classificationGroups?: string[];
  classificationItems?: string[];
  wordBank?: { words: string[]; mode: "single_use" | "multiple_use" };
  explanation: string;
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
  vocabularyMd?: string;
  grammar: GrammarExplanation;
  grammarMd?: string;
  speakingMd?: string;
  writingPromptMd?: string;
  hasNguphapQuestions?: boolean;
  videoR2Key?: string;
  listeningClips: { id: string; r2Key: string }[];
  readingPassages: { id: string; textDe: string }[];
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
