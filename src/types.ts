/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Source of truth: openapi.yaml
 * Keep in sync manually or run: npx openapi-typescript openapi.yaml -o src/types/api.ts
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export type Level = "A1" | "A2" | "B1";

export type QuizQuestionType = "multiple-choice" | "fill-blank" | "matching" | "listening";

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;          // UUID, maps to auth.users.id in Supabase
  email: string;
  fullName: string;
  avatarUrl?: string;
}

export interface UserProfilePatch {
  fullName?: string;
  avatarUrl?: string;
}

export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;       // ISO date string
  completedLessons: string[];    // lesson ids
  quizScores: Record<string, number>; // lessonId → percentage 0–100
}

export interface UserStatsPatch {
  xp?: number;
  streak?: number;
  lastPlayedDate?: string;
  completedLessons?: string[];
  quizScores?: Record<string, number>;
}

// ─── Content ─────────────────────────────────────────────────────────────────

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

export interface MatchingPair {
  de: string;
  vi: string;
}

/** Quiz question returned to the client — correctAnswer is NOT included */
export interface QuizQuestionPublic {
  id: string;
  type: QuizQuestionType;
  questionText: string;
  audioText?: string;        // for "listening" type, used with SpeechSynthesis
  options?: string[];        // for "multiple-choice"
  matchingPairs?: MatchingPair[]; // for "matching"
  explanation: string;
}

export interface LessonSummary {
  id: string;
  moduleId: string;
  moduleTitle: string;
  level: Level;
  title: string;
  titleVi: string;
  duration: string;          // e.g. "05:40"
  orderIndex: number;
  nextLessonId?: string | null;
}

export interface Lesson extends LessonSummary {
  objective: string;
  summary: string;
  youtubeId?: string;
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  quiz: QuizQuestionPublic[]; // no correctAnswer
}

export interface Module {
  id: string;
  level: Level;
  title: string;
  titleVi: string;
  lessons: Lesson[];
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export interface QuizAnswer {
  questionId: string;
  answer?: string;              // for multiple-choice / fill-blank / listening
  matchedPairs?: MatchingPair[]; // for matching type only
}

export interface QuizSubmission {
  answers: QuizAnswer[];
}

export interface QuizQuestionResult {
  questionId: string;
  correct: boolean;
  userAnswer: string;
  questionText: string;
  explanation: string;
  correctAnswer?: string;       // returned after submission for review UI
}

export interface QuizResult {
  lessonId: string;
  scorePercentage: number;      // 0–100
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  xpAwarded?: number;
  streakIncremented?: boolean;
  results: QuizQuestionResult[];
  stats: UserStats;
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface ProgressMutationResponse {
  lessonId: string;
  alreadyCompleted: boolean;
  xpAwarded: number;
  stats: UserStats;
}

// ─── Dashboard & Roadmap ─────────────────────────────────────────────────────

export interface LevelProgress {
  level: Level;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
}

export interface RecentScore {
  lessonId: string;
  title: string;
  score: number;
}

export interface DashboardSummary {
  user: User;
  stats: UserStats;
  nextSuggestedLesson: LessonSummary;
  levelProgress: LevelProgress[];
  recentScores: RecentScore[];
}

export type RoadmapLessonStatus = "completed" | "current" | "locked";

export interface RoadmapLesson {
  lesson: LessonSummary;
  status: RoadmapLessonStatus;
}

export interface RoadmapLevel {
  level: Level;
  title: string;
  description: string;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  lessons: RoadmapLesson[];
}

export interface Roadmap {
  overallProgress: {
    completedLessons: number;
    totalLessons: number;
    progressPercentage: number;
  };
  levels: RoadmapLevel[];
}

// ─── Landing Page Content ────────────────────────────────────────────────────

export interface Testimonial {
  name: string;
  role: string;
  content: string;
  avatarUrl?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ErrorResponse {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MessageResponse {
  message: string;
}

export interface ListResponse<T> {
  items: T[];
}

// ─── UI State (không phải API contract) ─────────────────────────────────────

export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz";
  selectedLessonId: string;
  user: User | null;
  stats: UserStats;
}
