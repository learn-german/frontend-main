import React, { useState } from "react";
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

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
}

interface Props {
  lesson: LessonEditable;
  onBack: () => void;
  onSaved: () => void;
}

// Inline editable text — looks like content, editable on focus
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

  const upd = (patch: Partial<LessonEditable>) => setData(prev => ({ ...prev, ...patch }));

  const updVocab = (idx: number, patch: Partial<VocabItem>) =>
    setData(prev => {
      const v = [...prev.vocabulary];
      v[idx] = { ...v[idx], ...patch };
      return { ...prev, vocabulary: v };
    });

  const addVocab = () =>
    setData(prev => ({
      ...prev,
      vocabulary: [...prev.vocabulary, { de: "", pronunciation: "", vi: "", exampleDe: "", exampleVi: "" }],
    }));

  const removeVocab = (idx: number) =>
    setData(prev => ({ ...prev, vocabulary: prev.vocabulary.filter((_, i) => i !== idx) }));

  const updGrammar = (patch: Partial<Grammar>) =>
    setData(prev => ({ ...prev, grammar: { ...prev.grammar, ...patch } }));

  const updGrammarEx = (idx: number, patch: Partial<GrammarExample>) =>
    setData(prev => {
      const ex = [...prev.grammar.examples];
      ex[idx] = { ...ex[idx], ...patch };
      return { ...prev, grammar: { ...prev.grammar, examples: ex } };
    });

  const addGrammarEx = () =>
    updGrammar({ examples: [...data.grammar.examples, { de: "", vi: "" }] });

  const removeGrammarEx = (idx: number) =>
    updGrammar({ examples: data.grammar.examples.filter((_, i) => i !== idx) });

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
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{data.level}</span>
              <span className="text-xs text-slate-400 font-mono">{data.id}</span>
            </div>
            <EditableText
              value={data.title}
              onChange={v => upd({ title: v })}
              className="text-xl font-display font-black text-slate-900 tracking-tight"
              placeholder="Tiêu đề (DE)"
            />
            <EditableText
              value={data.title_vi}
              onChange={v => upd({ title_vi: v })}
              className="text-sm text-slate-500"
              placeholder="Tiêu đề (VI)"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-500">
            <span className="text-xs font-bold text-slate-400">XP</span>
            <input
              type="number"
              value={data.xp_reward}
              onChange={e => upd({ xp_reward: parseInt(e.target.value) || 0 })}
              className="w-16 bg-transparent outline-none font-bold text-blue-600 text-center"
            />
          </div>
          <Button variant="primary" onClick={handleSave} className="flex-1 sm:flex-initial">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Lưu bài học
          </Button>
        </div>
      </div>

      {/* Main grid — mirrors LessonDetailPage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left column */}
        <div className="lg:col-span-8 space-y-8">

          {/* Video section */}
          <section className="space-y-3">
            <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
            </h2>
            <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              {data.youtube_id ? (
                <iframe
                  src={`https://www.youtube.com/embed/${data.youtube_id}`}
                  className="w-full h-full"
                  allowFullScreen
                  title={data.title}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Video className="w-10 h-10 opacity-30" />
                  <p className="text-xs">Chưa có video</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">YouTube ID:</span>
              <EditableText
                value={data.youtube_id ?? ""}
                onChange={v => upd({ youtube_id: v })}
                className="text-sm font-mono text-slate-700"
                placeholder="dQw4w9WgXcQ"
              />
            </div>
          </section>

          {/* Vocabulary section */}
          <section className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex justify-between items-center pb-3.5 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="text-base font-display font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-5 h-5 text-orange-600" /> Từ vựng then chốt
                </h2>
                <p className="text-xs text-slate-400">Click vào ô để chỉnh sửa trực tiếp</p>
              </div>
              <button
                onClick={addVocab}
                className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-xl hover:bg-orange-50 border border-orange-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm từ
              </button>
            </div>

            {data.vocabulary.length === 0 && (
              <p className="text-center py-6 text-sm text-slate-400 italic">Chưa có từ vựng. Nhấn "Thêm từ" để bắt đầu.</p>
            )}

            <div className="divide-y divide-slate-100">
              {data.vocabulary.map((vocab, idx) => (
                <div key={idx} className="py-4 first:pt-0 grid grid-cols-1 md:grid-cols-12 gap-3 items-start group">

                  {/* DE + pronunciation */}
                  <div className="md:col-span-4 flex items-start gap-2.5">
                    <div className="w-8 h-8 mt-1 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <EditableText
                        value={vocab.de}
                        onChange={v => updVocab(idx, { de: v })}
                        className="font-display font-extrabold text-slate-900"
                        placeholder="Từ tiếng Đức"
                      />
                      <EditableText
                        value={vocab.pronunciation}
                        onChange={v => updVocab(idx, { pronunciation: v })}
                        className="font-mono text-xs text-slate-400"
                        placeholder="[phiên âm]"
                      />
                    </div>
                  </div>

                  {/* VI */}
                  <div className="md:col-span-3">
                    <EditableText
                      value={vocab.vi}
                      onChange={v => updVocab(idx, { vi: v })}
                      className="text-sm font-semibold text-slate-700"
                      placeholder="Nghĩa tiếng Việt"
                    />
                  </div>

                  {/* Examples */}
                  <div className="md:col-span-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">🇩🇪</span>
                      <EditableText
                        value={vocab.exampleDe}
                        onChange={v => updVocab(idx, { exampleDe: v })}
                        className="text-xs font-display font-semibold text-slate-700"
                        placeholder="Ví dụ tiếng Đức"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">🇻🇳</span>
                      <EditableText
                        value={vocab.exampleVi}
                        onChange={v => updVocab(idx, { exampleVi: v })}
                        className="text-xs italic text-slate-500"
                        placeholder="Dịch tiếng Việt"
                      />
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      onClick={() => removeVocab(idx)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-8">

          {/* Objective + Summary */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-amber-500" /> Mục tiêu bài học
            </h3>
            <EditableText
              value={data.objective ?? ""}
              onChange={v => upd({ objective: v })}
              multiline
              rows={4}
              className="text-xs text-slate-600 leading-relaxed"
              placeholder="Mô tả mục tiêu bài học..."
            />
            <div className="h-px bg-slate-100" />
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Tóm tắt</span>
              <EditableText
                value={data.summary ?? ""}
                onChange={v => upd({ summary: v })}
                multiline
                rows={3}
                className="text-xs text-slate-500 leading-relaxed"
                placeholder="Tóm tắt nội dung..."
              />
            </div>
          </div>

          {/* Grammar */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
              Ngữ pháp then chốt
            </span>

            <EditableText
              value={data.grammar.title}
              onChange={v => updGrammar({ title: v })}
              className="text-base font-display font-bold text-slate-900"
              placeholder="Tiêu đề ngữ pháp"
            />

            <EditableText
              value={data.grammar.rule}
              onChange={v => updGrammar({ rule: v })}
              multiline
              rows={5}
              className="text-xs text-slate-600 leading-relaxed"
              placeholder="Giải thích quy tắc ngữ pháp..."
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-display font-bold text-slate-400 uppercase">Ví dụ minh họa</span>
                <button
                  onClick={addGrammarEx}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Thêm
                </button>
              </div>

              {data.grammar.examples.map((ex, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm space-y-1.5 group relative">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">🇩🇪</span>
                    <EditableText
                      value={ex.de}
                      onChange={v => updGrammarEx(idx, { de: v })}
                      className="text-xs font-display font-bold text-slate-900"
                      placeholder="Ví dụ tiếng Đức"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">🇻🇳</span>
                    <EditableText
                      value={ex.vi}
                      onChange={v => updGrammarEx(idx, { vi: v })}
                      className="text-xs italic text-slate-500"
                      placeholder="Dịch tiếng Việt"
                    />
                  </div>
                  <button
                    onClick={() => removeGrammarEx(idx)}
                    className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
