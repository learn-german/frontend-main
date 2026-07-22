import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useMediaPlaybackUrl(
  lessonId: string,
  type: "video" | "audio" | "image",
  objectKey: string | undefined,
  clipId?: string,
): { url: string | null; loading: boolean; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectKey) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) { setError("Chưa đăng nhập"); setLoading(false); }
        return;
      }
      try {
        const clipParam = clipId ? `&clipId=${encodeURIComponent(clipId)}` : "";
        const objectKeyParam = type === "image" ? `&objectKey=${encodeURIComponent(objectKey)}` : "";
        const res = await fetch(`/api/media/playback-url?lessonId=${encodeURIComponent(lessonId)}&type=${type}${clipParam}${objectKeyParam}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { url: string };
        if (!cancelled) { setUrl(body.url); setLoading(false); }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không tải được media");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [lessonId, type, objectKey, clipId]);

  return { url, loading, error };
}
