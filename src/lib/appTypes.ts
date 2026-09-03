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
    | "fill_in_the_blank"
    | "multiple_choice"
    | "matching"
    | "richtig_falsch";
  groupId?: string;
  hint?: string;
  promptText?: string;
  transformationHint?: string;
  tokens?: string[];
  classificationGroups?: string[];
  classificationItems?: string[];
  wordBank?: { words: string[]; mode: "single_use" | "multiple_use" };
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  audioClipId?: string;
  readingPassageId?: string;
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
  hasNgheQuestions?: boolean;
  hasDocQuestions?: boolean;
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
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard" | "packages" | "help";
}

export type SupportTicketStatus = "pending" | "processing" | "resolved";

export type SupportTicketTopic =
  | "website_issue"
  | "lesson_content"
  | "exercise_feedback"
  | "account_access"
  | "other";

/** Khoá tiếng Anh lưu trong DB, nhãn tiếng Việt chỉ dùng để hiển thị. */
export const SUPPORT_TOPIC_LABELS: Record<SupportTicketTopic, string> = {
  website_issue: "Lỗi hoặc sự cố trên website",
  lesson_content: "Nội dung bài học / bài tập",
  exercise_feedback: "Đóng góp ý kiến cho phần bài tập",
  account_access: "Tài khoản hoặc quyền truy cập",
  other: "Khác",
};

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  pending: "Đang chờ xử lý",
  processing: "Đang xử lý",
  resolved: "Đã xử lý",
};

export interface SupportTicket {
  id: string;
  code: string;
  userId: string;
  title: string;
  topic: SupportTicketTopic;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  /** Chỉ màn admin mới nhúng; màn học viên luôn là null. */
  author: { email: string; fullName: string | null } | null;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  isStaff: boolean;
  body: string;
  imageKeys: string[];
  createdAt: string;
}
