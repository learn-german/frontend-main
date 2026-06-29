import React from "react";
import { Video } from "lucide-react";

interface VideoPlayerProps {
  youtubeId?: string;
  title: string;
  levelBadge: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  youtubeId,
  title,
  levelBadge,
}) => {
  if (youtubeId) {
    return (
      <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full aspect-video"
          loading="lazy"
        />
      </div>
    );
  }

  // Placeholder when no video is available yet
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50 aspect-video flex flex-col items-center justify-center gap-3 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
        <Video className="w-6 h-6 text-slate-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-display font-bold text-slate-600">{title}</p>
        <span className="inline-block text-[10px] font-display font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
          {levelBadge}
        </span>
      </div>
      <p className="text-xs text-slate-400 max-w-xs">
        Nội dung video bài giảng đang được chuẩn bị.
      </p>
    </div>
  );
};
