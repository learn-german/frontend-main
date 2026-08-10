import React, { useRef, useState } from "react";
import { Trash2, Image as ImageIcon, Eye, Pencil } from "lucide-react";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
import { uploadMedia } from "../../lib/uploadMedia";
import { showToast } from "../../lib/toast";
import { MarkdownBlock } from "../../components/MarkdownBlock";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  lessonId: string;
  index: number;
  saving: boolean;
  onSave: (id: string, textDe: string) => void;
  onDelete: (p: ReadingPassage) => void;
}> = ({ passage, lessonId, index, saving, onSave, onDelete }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = textDe !== passage.text_de;

  const insertImage = (objectKey: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? textDe.length;
    const end = textarea?.selectionEnd ?? textDe.length;
    const markdown = `![](r2img:${objectKey})`;
    setTextDe(textDe.slice(0, start) + markdown + textDe.slice(end));
  };

  const uploadImage = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP", "warning");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("Ảnh vượt quá 5MB", "warning");
      return;
    }
    setUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, lessonId, "image", setUploadPct);
      insertImage(objectKey);
      showToast("Đã thêm ảnh vào đoạn văn.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setUploadPct(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) uploadImage(file);
  };

  return (
    <div className="p-2.5 bg-slate-50/60 rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">Văn bản {index + 1}</span>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
            <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
            {uploadPct !== null ? `${uploadPct}%` : "Thêm ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadPct !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
          </label>
          <button onClick={() => setTab(tab === "edit" ? "preview" : "edit")} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title={tab === "edit" ? "Xem trước" : "Chỉnh sửa"}>
            {tab === "edit" ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
          {dirty && (
            <button onClick={() => onSave(passage.id, textDe)} disabled={saving} className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu văn bản"}
            </button>
          )}
          <button onClick={() => onDelete(passage)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa văn bản">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {tab === "edit" ? (
        <textarea
          ref={textareaRef}
          rows={4}
          value={textDe}
          onChange={(e) => setTextDe(e.target.value)}
          onPaste={handlePaste}
          placeholder="Nhập văn bản (hỗ trợ Markdown, paste ảnh trực tiếp)..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y font-mono"
        />
      ) : (
        <div className="min-h-16 bg-white border border-slate-200 rounded-xl p-3">
          {textDe ? <MarkdownBlock content={textDe} lessonId={lessonId} /> : <p className="text-xs text-slate-400 italic">Chưa có nội dung.</p>}
        </div>
      )}
    </div>
  );
};
