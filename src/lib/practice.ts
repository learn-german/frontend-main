import type { Level, Lesson } from './appTypes';
import type { ExerciseSet } from './hooks/useExerciseSets';

export const PRACTICE_CATEGORIES = { nguphap: 'Ngữ pháp', doc: 'Bài đọc', nghe: 'Bài nghe' } as const;
export type PracticeCategory = keyof typeof PRACTICE_CATEGORIES;
export interface PracticeSetRow {
  id: string; lesson_id: string; category: string; title: string; order_index: number;
  status: 'draft' | 'published'; general_instruction?: string | null; audio_clip_id?: string | null;
  audio_r2_key?: string | null; transcription?: string | null; question_count: number; question_types?: string[];
}
export interface PracticeTopic {
  topic_id: string; topic_title: string; topic_title_vi: string; level: Level;
  category: PracticeCategory; order_index: number; sets: PracticeSetRow[];
}
export function practiceSearchKey(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
}
export function practiceTopicSummary(sets: Pick<PracticeSetRow, 'id' | 'question_count'>[], submitted: Set<string>) {
  return { sets: sets.length, questions: sets.reduce((sum, set) => sum + set.question_count, 0), completed: sets.filter(set => submitted.has(set.id)).length };
}
export function practiceExerciseSet(row: PracticeSetRow): ExerciseSet {
  return { id: row.id, lessonId: row.lesson_id, category: row.category, title: row.title, orderIndex: row.order_index, status: row.status, generalInstruction: row.general_instruction, audioClipId: row.audio_clip_id, transcription: null };
}
export function practiceLesson(topic: PracticeTopic): Lesson {
  return { id: topic.topic_id, level: topic.level, title: topic.topic_title, titleVi: topic.topic_title_vi, moduleTitle: 'Luyện tập', duration: '', objective: '', summary: '', grammar: { title: '', rule: '', examples: [] }, listeningClips: topic.sets.filter(set => set.audio_clip_id && set.audio_r2_key).map(set => ({ id: set.audio_clip_id!, r2Key: set.audio_r2_key! })), readingPassages: [] };
}
