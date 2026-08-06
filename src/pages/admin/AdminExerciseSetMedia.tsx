import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";

export interface ListeningClip {
  id: string;
  lesson_id: string;
  r2_key: string;
  order_index: number;
}

export interface ReadingPassage {
  id: string;
  lesson_id: string;
  text_de: string;
  order_index: number;
}

export const ClipRow: React.FC<{ lessonId: string; clip: ListeningClip; index: number; onDelete: (c: ListeningClip) => void }> = ({
  lessonId,
  clip,
  index,
  onDelete,
}) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);
  return (
    <div className="flex items-center gap-3 p-2.5 bg-slate-50/60 rounded-xl">
      <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
      <div className="flex-1 min-w-0">
        {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
        {playback.url && <audio controls src={playback.url} className="w-full h-8">Trình duyệt không hỗ trợ audio.</audio>}
        {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
      </div>
      <button onClick={() => onDelete(clip)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0" title="Xóa file mp3">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const PassageEditRow: React.FC<{
  passage: ReadingPassage;
  index: number;
  saving: boolean;
  onSave: (id: string, textDe: string) => void;
  onDelete: (p: ReadingPassage) => void;
}> = ({ passage, index, saving, onSave, onDelete }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const dirty = textDe !== passage.text_de;
  return (
    <div className="p-2.5 bg-slate-50/60 rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">Đoạn {index + 1}</span>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <button onClick={() => onSave(passage.id, textDe)} disabled={saving} className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu đoạn văn"}
            </button>
          )}
          <button onClick={() => onDelete(passage)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa đoạn văn">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <textarea
        rows={3}
        value={textDe}
        onChange={(e) => setTextDe(e.target.value)}
        placeholder="Nhập đoạn văn tiếng Đức..."
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
      />
    </div>
  );
};
