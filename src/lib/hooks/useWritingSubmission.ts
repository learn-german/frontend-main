import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export interface WritingSubmission {
  id: string;
  content: string;
  score: number | null;
  comment: string | null;
  gradedAt: string | null;
  submittedAt: string;
}

export function useWritingSubmission(lessonId: string, userId: string | null) {
  const [submission, setSubmission] = useState<WritingSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmission = useCallback(() => {
    if (!userId) {
      setSubmission(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, content, score, comment, graded_at, submitted_at")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else if (data) {
          setSubmission({
            id: data.id as string,
            content: data.content as string,
            score: data.score as number | null,
            comment: data.comment as string | null,
            gradedAt: data.graded_at as string | null,
            submittedAt: data.submitted_at as string,
          });
        } else {
          setSubmission(null);
        }
        setLoading(false);
      });
  }, [lessonId, userId]);

  useEffect(() => { fetchSubmission(); }, [fetchSubmission]);

  const submit = async (content: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: "Chưa đăng nhập." };
    const { error: err } = await supabase.from("writing_submissions").upsert(
      {
        lesson_id: lessonId,
        user_id: userId,
        content,
        score: null,
        comment: null,
        graded_at: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,user_id" },
    );
    if (err) return { error: err.message };
    fetchSubmission();
    return { error: null };
  };

  return { submission, loading, error, submit };
}
