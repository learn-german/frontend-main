import React from "react";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";

interface ListeningClipPlayerProps {
  lessonId: string;
  clip: { id: string; r2Key: string };
  label: string;
}

export const ListeningClipPlayer: React.FC<ListeningClipPlayerProps> = ({ lessonId, clip, label }) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2Key, clip.id);
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-display font-bold text-slate-500">{label}</span>
      {playback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
      {playback.url && (
        <audio controls src={playback.url} className="w-full rounded-xl">
          Trình duyệt không hỗ trợ audio.
        </audio>
      )}
      {playback.error && <p className="text-xs text-red-500">Không tải được audio: {playback.error}</p>}
    </div>
  );
};
