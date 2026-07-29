import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export const MAX_WRITING_ATTEMPTS = 6;

export interface WritingSubmission {
  id: string;
  content: string;
  score: number | null;
  comment: string | null;
  gradedAt: string | null;
  submittedAt: string;
}

export function useWritingSubmission(lessonId: string, userId: string | null) {
  const [attempts, setAttempts] = useState<WritingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttempts = useCallback(() => {
    if (!userId) {
      setAttempts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, content, score, comment, graded_at, submitted_at")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setAttempts(
            (data ?? []).map((d) => ({
              id: d.id as string,
              content: d.content as string,
              score: d.score as number | null,
              comment: d.comment as string | null,
              gradedAt: d.graded_at as string | null,
              submittedAt: d.submitted_at as string,
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId, userId]);

  useEffect(() => { fetchAttempts(); }, [fetchAttempts]);

  // attempts is newest-first, so attempts[0] is the one a resubmit overwrites.
  const pendingAttempt = attempts[0]?.gradedAt === null ? attempts[0] : null;

  const submit = async (content: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: "Chưa đăng nhập." };

    // Resubmitting over an ungraded attempt overwrites it rather than burning
    // another of the 6 slots — the admin has nothing to lose there yet.
    if (pendingAttempt) {
      const now = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("writing_submissions")
        .update({ content, submitted_at: now, updated_at: now })
        .eq("id", pendingAttempt.id);
      if (updateErr) return { error: updateErr.message };
      fetchAttempts();
      return { error: null };
    }

    if (attempts.length >= MAX_WRITING_ATTEMPTS) {
      return { error: "Bạn đã dùng hết 6 lần nộp cho bài viết này." };
    }
    const { error: err } = await supabase.from("writing_submissions").insert({
      lesson_id: lessonId,
      user_id: userId,
      content,
      score: null,
      comment: null,
      graded_at: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (err) {
      // The server-side trigger also enforces the cap; surface a friendly message.
      if (err.message.includes("writing attempt limit")) {
        return { error: "Bạn đã dùng hết 6 lần nộp cho bài viết này." };
      }
      return { error: err.message };
    }
    fetchAttempts();
    return { error: null };
  };

  const attemptCount = attempts.length;
  // Overwriting a pending attempt stays allowed even at the cap: it consumes no slot.
  const canSubmit = attemptCount < MAX_WRITING_ATTEMPTS || pendingAttempt !== null;

  return { attempts, attemptCount, canSubmit, hasPendingAttempt: pendingAttempt !== null, loading, error, submit };
}
