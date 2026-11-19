import type { SupabaseClient } from '@supabase/supabase-js';
import { SPEAKING_BUCKET, speakingContentType, validateSpeakingFile, type SpeakingSubmission } from './speaking';

export function validateSpeakingFeedbackFile(file: { name: string; size: number }): string | null {
  if (file.name.length > 255) return 'Tên file tối đa 255 ký tự.';
  return validateSpeakingFile(file);
}

export async function saveSpeakingFeedback(client: SupabaseClient, submission: SpeakingSubmission,
  score: number, comment: string, file: File | null, removeAudio: boolean): Promise<string | null> {
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error('Điểm phải là số nguyên từ 0 đến 100.');
  if (comment.trim().length > 10000) throw new Error('Nhận xét tối đa 10000 ký tự.');
  if (file) {
    const validation = validateSpeakingFeedbackFile(file);
    if (validation) throw new Error(validation);
  }
  const bucket = client.storage.from(SPEAKING_BUCKET);
  const oldKey = submission.feedback_object_key;
  let newKey = removeAudio ? null : oldKey;
  let uploadedKey: string | null = null;
  const cleanup = async (key: string) => {
    try {
      const { error } = await bucket.remove([key]);
      return !!error;
    } catch { return true; }
  };
  try {
    if (file) {
      newKey = `feedback/${submission.id}/${crypto.randomUUID()}.${file.name.split('.').pop()!.toLowerCase()}`;
      uploadedKey = newKey;
      const { error } = await bucket.upload(newKey, file, { contentType: speakingContentType(file.name), upsert: false });
      if (error) throw error;
    }
    const { data, error } = await client.from('speaking_submissions').update({
      score, comment: comment.trim() || null, graded_at: new Date().toISOString(),
      feedback_object_key: newKey,
      feedback_file_name: file ? file.name : removeAudio ? null : submission.feedback_file_name,
    }).eq('id', submission.id).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Không lưu được điểm.');
  } catch (error) {
    // The Storage policy preserves attached audio even when a committed update loses its response.
    if (uploadedKey) await cleanup(uploadedKey);
    throw error;
  }
  return oldKey && oldKey !== newKey && await cleanup(oldKey)
    ? 'Đã lưu điểm. Không dọn được file phản hồi cũ.' : null;
}
