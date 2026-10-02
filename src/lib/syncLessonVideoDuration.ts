import { supabase } from "./supabase";
import { formatDurationClock } from "./lessonDuration";

/** Persist measured R2 video length via SECURITY DEFINER RPC. No-op if unchanged. */
export async function syncLessonVideoDuration(
  lessonId: string,
  seconds: number,
): Promise<string | null> {
  const rounded = Math.round(seconds);
  if (!Number.isFinite(rounded) || rounded < 1) return null;
  const { data, error } = await supabase.rpc("sync_lesson_video_duration", {
    p_lesson_id: lessonId,
    p_seconds: rounded,
  });
  if (error) {
    console.warn("sync_lesson_video_duration failed", error.message);
    return null;
  }
  return typeof data === "string" ? data : formatDurationClock(rounded);
}
