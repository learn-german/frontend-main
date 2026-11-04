import { useEffect } from 'react';
import { supabase } from '../supabase';

// Replay a stored request to restore the server-gated reveal without creating an attempt.
export function usePracticeResult<T>(setId: string, enabled: boolean, endpoint: 'grammar-submit' | 'reading-submit', onResult: (result: T) => void, onError: (message: string) => void) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      const { data: previous, error } = await supabase.from('practice_submission_history')
        .select('submission_id,answers').eq('set_id', setId).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!previous) return;
      const { data, error: replayError } = await supabase.functions.invoke(endpoint, { body: { set_id: setId, submission_id: previous.submission_id, answers: previous.answers } });
      if (replayError) throw replayError;
      if (data?.error) throw new Error(data.error);
      if (active) onResult(data as T);
    })().catch(error => { if (active) onError(error instanceof Error ? error.message : 'Không tải được kết quả luyện tập.'); });
    return () => { active = false; };
  }, [setId, enabled, endpoint, onResult, onError]);
}
