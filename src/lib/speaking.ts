export const SPEAKING_BUCKET = 'speaking-recordings';
export const MAX_SPEAKING_ATTEMPTS = 2;
export const MAX_SPEAKING_FILE_SIZE = 25 * 1024 * 1024;
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
};

export function speakingContentType(name: string): string {
  return AUDIO_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
}

export function validateSpeakingFile(file: { name: string; size: number }): string | null {
  if (!speakingContentType(file.name)) return 'Chọn file MP3, M4A, WAV, WEBM hoặc OGG.';
  if (file.size <= 0 || file.size > MAX_SPEAKING_FILE_SIZE) return 'File âm thanh phải lớn hơn 0 và tối đa 25 MB.';
  return null;
}

export interface SpeakingSubmission {
  id: string;
  lesson_id: string;
  user_id: string;
  object_key: string;
  file_name: string;
  note: string | null;
  score: number | null;
  comment: string | null;
  graded_at: string | null;
  submitted_at: string;
}
