/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Level = "A1" | "A2" | "B1";

export interface VocabularyItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

export interface GrammarExplanation {
  title: string;
  rule: string;
  examples: { de: string; vi: string }[];
}

export type QuizQuestionType = "multiple-choice" | "fill-blank" | "matching" | "listening";

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  questionText: string;
  audioText?: string; // used for listening questions
  options?: string[]; // used for multiple-choice or mismatching fields
  matchingPairs?: { de: string; vi: string }[]; // used for matching type
  correctAnswer: string; // for MC: string option; for fill-blank: correct word; etc.
  explanation: string;
}

export interface Lesson {
  id: string;
  level: Level;
  moduleTitle: string; // E.g., "Greetings & Basics"
  title: string;       // German title
  titleVi: string;     // Vietnamese translation
  duration: string;    // video duration
  objective: string;
  summary: string;
  youtubeId?: string;  // mock video code if any
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

export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[]; // lesson ids
  quizScores: Record<string, number>; // lessonId -> percentage score
}

export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz";
  selectedLessonId: string;
  user: {
    email: string;
    fullName: string;
    avatarUrl?: string;
  } | null;
  stats: UserStats;
}
