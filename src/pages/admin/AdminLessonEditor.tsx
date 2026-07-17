import React, { useState } from "react";
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2,
  Globe, EyeOff,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";

interface VocabItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

interface GrammarExample { de: string; vi: string; }
interface Grammar { title: string; rule: string; examples: GrammarExample[]; }

export interface LessonEditable {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  duration: string;
  xp_reward: number;
  youtube_id: string | null;
  objective: string | null;
  summary?: string | null;
  vocabulary: VocabItem[];
  grammar: Grammar;
  grammar_md?: string | null;
  speaking_md?: string | null;
  writing_prompt_md?: string | null;
  video_r2_key?: string | null;
  status: "draft" | "published";
}

interface Props {
  lesson: LessonEditable;
  onBack: () => void;
  onSaved: () => void;
}

const EditableText: React.FC<{
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
}> = ({ value, onChange, multiline, rows = 3, className = "", placeholder }) => {
  const base = `w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-400/20 rounded-lg px-2 py-1 outline-none transition-all resize-none ${className}`;
  return multiline ? (
    <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} />
  ) : (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} />
  );
};

export const AdminLessonEditor: React.FC<Props> = ({ lesson: initial, onBack, onSaved }) => {
  const [data, setData] = useState<LessonEditable>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [grammarTab, setGrammarTab] = useState<"edit" | "preview">("edit");
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
  const [writingTab, setWritingTab] = useState<"edit" | "preview">("edit");
  const [videoUploadPct, setVideoUploadPct] = useState<number | null>(null);

  const upd = (patch: Partial<LessonEditable>) => setData(prev => ({ ...prev, ...patch }));

  const updVocab = (idx: number, patch: Partial<VocabItem>) =>
    setData(prev => { const v = [...prev.vocabulary]; v[idx] = { ...v[idx], ...patch }; return { ...prev, vocabulary: v }; });

  const addVocab = () =>
    setData(prev => ({ ...prev, vocabulary: [{ de: "", pronunciation: "", vi: "", exampleDe: "", exampleVi: "" }, ...prev.vocabulary] }));

  const removeVocab = (idx: number) =>
    setData(prev => ({ ...prev, vocabulary: prev.vocabulary.filter((_, i) => i !== idx) }));

  const handleVideoUpload = async (file: File) => {
    setVideoUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, data.id, "video", setVideoUploadPct);
      upd({ video_r2_key: objectKey });
      showToast("Đã tải video lên, nhớ bấm Lưu bài học.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải video lên thất bại", "warning");
    } finally {
      setVideoUploadPct(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      writing_prompt_md: data.writing_prompt_md || null,
      video_r2_key: data.video_r2_key || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      writing_prompt_md: data.writing_prompt_md || null,
      video_r2_key: data.video_r2_key || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
    } else {
      showToast("Đã public bài học.", "success");
      onSaved();
    }
  };

  const handleRevertToDraft = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({ status: "draft" }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Chuyển về Nháp thất bại: " + error.message, "warning");
    } else {
      showToast("Đã chuyển về Nháp.", "success");
      onSaved();
    }
  };

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-500 mb-1";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{data.level}</span>
              <span className="text-xs text-slate-400 font-mono">{data.id}</span>
            </div>
            <EditableText value={data.title} onChange={v => upd({ title: v })} className="text-xl font-display font-black text-slate-900 tracking-tight" placeholder="Tiêu đề (DE)" />
            <EditableText value={data.title_vi} onChange={v => upd({ title_vi: v })} className="text-sm text-slate-500" placeholder="Tiêu đề (VI)" />
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <LessonStatusBadge status={data.status} />
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-500">
            <span className="text-xs font-bold text-slate-400">XP</span>
            <input type="number" value={data.xp_reward} onChange={e => upd({ xp_reward: parseInt(e.target.value) || 0 })} className="w-16 bg-transparent outline-none font-bold text-blue-600 text-center" />
          </div>
          <Button variant="secondary" onClick={handleSave} className="flex-1 sm:flex-initial">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Lưu bài học
          </Button>
          {data.status === "draft" ? (
            <Button variant="primary" onClick={handlePublish} className="flex-1 sm:flex-initial">
              <Globe className="w-4 h-4 mr-1" /> Public
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleRevertToDraft}>
              <EyeOff className="w-4 h-4 mr-1" /> Chuyển về Nháp
            </Button>
          )}
        </div>
      </div>

      {/* Main grid — mirrors LessonDetailPage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left column: Video + Grammar */}
        <div className="lg:col-span-8 space-y-8">

          {/* Video */}
          <section className="space-y-3">
            <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
            </h2>
            <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              {data.video_r2_key ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Video className="w-10 h-10 text-orange-400" />
                  <p className="text-xs font-mono">{data.video_r2_key}</p>
                </div>
              ) : data.youtube_id ? (
                <iframe src={`https://www.youtube.com/embed/${data.youtube_id}`} className="w-full h-full" allowFullScreen title={data.title} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Video className="w-10 h-10 opacity-30" />
                  <p className="text-xs">Chưa có video</p>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition">
              <Video className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-xs font-bold text-slate-600">
                {videoUploadPct !== null ? `Đang tải lên... ${videoUploadPct}%` : "Tải video lên (.mp4)"}
              </span>
              <input
                type="file"
                accept="video/mp4"
                className="hidden"
                disabled={videoUploadPct !== null}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ""; }}
              />
            </label>
            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer">Nhập thủ công (cũ) — YouTube ID</summary>
              <div className="flex items-center gap-2 mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-slate-400 whitespace-nowrap">YouTube ID:</span>
                <EditableText value={data.youtube_id ?? ""} onChange={v => upd({ youtube_id: v })} className="text-sm font-mono text-slate-700" placeholder="dQw4w9WgXcQ" />
              </div>
            </details>
          </section>

          {/* Grammar — Markdown editor */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Ngữ pháp then chốt
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setGrammarTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${grammarTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {grammarTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
                <textarea
                  rows={12}
                  value={data.grammar_md ?? ""}
                  onChange={e => upd({ grammar_md: e.target.value })}
                  placeholder={"## Mạo từ (Artikel)\n\nTiếng Đức có 3 mạo từ: **der** (nam), **die** (nữ), **das** (trung)\n\n### Ví dụ\n- **der** Mann (người đàn ông)\n- **die** Frau (người phụ nữ)\n- **das** Kind (đứa trẻ)"}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.grammar_md ? (
                  <MarkdownBlock content={data.grammar_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung ngữ pháp.</p>
                )}
              </div>
            )}
          </div>

          {/* Nói — Markdown editor */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Nói
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSpeakingTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${speakingTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {speakingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
                <textarea
                  rows={12}
                  value={data.speaking_md ?? ""}
                  onChange={e => upd({ speaking_md: e.target.value })}
                  placeholder={"## Luyện nói: Giới thiệu bản thân\n\nHãy tập nói to các câu sau:\n- \"Guten Tag! Ich heiße ...\"\n- \"Ich komme aus ...\""}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.speaking_md ? (
                  <MarkdownBlock content={data.speaking_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung luyện nói.</p>
                )}
              </div>
            )}
          </div>

          {/* Viết — Markdown editor cho đề bài. Học viên viết bài + admin
              chấm điểm được quản lý ở trang "Chấm bài viết" riêng, không
              phải ở đây — trang này chỉ soạn đề bài. */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Viết
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setWritingTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${writingTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {writingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Đề bài viết cho học viên. Hỗ trợ Markdown giống ô Nói ở trên.</p>
                <textarea
                  rows={8}
                  value={data.writing_prompt_md ?? ""}
                  onChange={e => upd({ writing_prompt_md: e.target.value })}
                  placeholder={"## Đề bài: Viết đoạn văn giới thiệu bản thân\n\nViết khoảng 5-7 câu bằng tiếng Đức giới thiệu tên, quê quán, nghề nghiệp của bạn."}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.writing_prompt_md ? (
                  <MarkdownBlock content={data.writing_prompt_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có đề bài viết.</p>
                )}
              </div>
            )}
          </div>

          {/* Vocabulary */}
          <section className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                </h2>
                <p className="text-[10px] text-slate-400">Click ô để chỉnh sửa trực tiếp</p>
              </div>
              <button onClick={addVocab} className="flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 px-2.5 py-1.5 rounded-xl hover:bg-orange-50 border border-orange-200 transition-colors">
                <Plus className="w-3 h-3" /> Thêm
              </button>
            </div>

            {data.vocabulary.length === 0 && (
              <p className="text-center py-4 text-xs text-slate-400 italic">Chưa có từ vựng.</p>
            )}

            <div className="divide-y divide-slate-100 space-y-0">
              {data.vocabulary.map((vocab, idx) => (
                <div key={idx} className="py-3 first:pt-0 space-y-1.5 group">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 mt-0.5 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                      <Volume2 className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex gap-1.5">
                        <EditableText value={vocab.de} onChange={v => updVocab(idx, { de: v })} className="font-display font-extrabold text-slate-900 text-sm flex-1" placeholder="Tiếng Đức" />
                        <EditableText value={vocab.pronunciation} onChange={v => updVocab(idx, { pronunciation: v })} className="font-mono text-[10px] text-slate-400 w-20" placeholder="[phiên âm]" />
                      </div>
                      <EditableText value={vocab.vi} onChange={v => updVocab(idx, { vi: v })} className="text-xs font-semibold text-slate-700" placeholder="Nghĩa tiếng Việt" />
                      <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-100 space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-300">🇩🇪</span>
                          <EditableText value={vocab.exampleDe} onChange={v => updVocab(idx, { exampleDe: v })} className="text-[11px] font-display font-semibold text-slate-700" placeholder="Ví dụ DE" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-300">🇻🇳</span>
                          <EditableText value={vocab.exampleVi} onChange={v => updVocab(idx, { exampleVi: v })} className="text-[11px] italic text-slate-500" placeholder="Dịch VI" />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeVocab(idx)} className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Right column: Objective */}
        <div className="lg:col-span-4 space-y-8">

          {/* Objective + Summary */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-amber-500" /> Mục tiêu bài học
            </h3>
            <EditableText value={data.objective ?? ""} onChange={v => upd({ objective: v })} multiline rows={4} className="text-xs text-slate-600 leading-relaxed" placeholder="Mô tả mục tiêu bài học..." />
            <div className="h-px bg-slate-100" />
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Tóm tắt</span>
              <EditableText value={data.summary ?? ""} onChange={v => upd({ summary: v })} multiline rows={3} className="text-xs text-slate-500 leading-relaxed" placeholder="Tóm tắt nội dung..." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
