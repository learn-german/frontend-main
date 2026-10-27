import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Pencil, Plus } from 'lucide-react';
import { Button } from '../../components/DesignSystem';
import type { Level } from '../../lib/appTypes';
import { adminImportLessonVocabulary, adminLoadDictionary, adminSaveDictionaryEntry, adminSaveDictionaryTopic, adminUploadDictionaryAudio, dictionaryAudioUrl } from '../../lib/dictionary';
import { blankDictionaryContent, DICTIONARY_TYPES, dictionaryDuplicateKey, matchesDictionarySearch, validateDictionaryContent } from '../../lib/dictionaryModel';
import type { DictionaryContent, DictionaryEntry, DictionaryLesson, DictionaryTopic } from '../../lib/dictionaryModel';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';
const panelClass = 'rounded-2xl border border-slate-200 bg-white p-5';
const errorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Thao tác thất bại. Vui lòng thử lại.';

function TopicForm({ topic, order, onSaved, onCancel, inline = false }: {
  topic?: DictionaryTopic; order: number; onSaved: (topic: DictionaryTopic) => void; onCancel?: () => void; inline?: boolean;
}) {
  const [vi, setVi] = useState(topic?.vi ?? '');
  const [de, setDe] = useState(topic?.de ?? '');
  const [position, setPosition] = useState(topic?.order ?? order);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault();
    if (saving.current) return;
    if (!vi.trim() || !de.trim()) { setError('Nhập tên chủ đề bằng cả tiếng Việt và tiếng Đức.'); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      onSaved(await adminSaveDictionaryTopic({ vi: vi.trim(), de: de.trim(), order: position }, topic?.id));
      if (!topic) { setVi(''); setDe(''); setPosition(position + 1); }
    }
    catch (error) { setError(errorMessage(error)); }
    finally { saving.current = false; setBusy(false); }
  }}>
    <label className="block text-sm font-medium">Tên tiếng Việt<input className={inputClass} required maxLength={60} value={vi} onChange={event => setVi(event.target.value)} disabled={busy} /></label>
    <label className="block text-sm font-medium">Tên tiếng Đức<input className={inputClass} required maxLength={60} value={de} onChange={event => setDe(event.target.value)} disabled={busy} /></label>
    {!inline && <label className="block text-sm font-medium">Thứ tự hiển thị<input className={inputClass} type="number" min={1} max={999} required value={position} onChange={event => setPosition(Number(event.target.value))} disabled={busy} /></label>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{busy ? 'Đang lưu…' : inline ? 'Tạo & chọn' : topic ? 'Lưu thay đổi' : 'Tạo chủ đề'}</Button>{onCancel && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Hủy</Button>}</div>
  </form>;
}

function DictionaryEditor({ entry, entries, topics, lessons, onTopic, onSaved, onClose, onOpen }: {
  entry?: DictionaryEntry; entries: DictionaryEntry[]; topics: DictionaryTopic[]; lessons: DictionaryLesson[];
  onTopic: (topic: DictionaryTopic) => void; onSaved: () => Promise<void>; onClose: () => void; onOpen: (entry: DictionaryEntry) => void;
}) {
  const [content, setContent] = useState<DictionaryContent>(() => {
    const value = entry?.draft ?? entry ?? blankDictionaryContent();
    return { word: value.word, type: value.type, article: value.article, plural: value.plural, inflection: value.inflection,
      meaning: value.meaning, ipa: value.ipa, example: value.example, translation: value.translation, course: value.course,
      topics: [...value.topics], lessons: [...value.lessons], audio: value.audio };
  });
  const [editId, setEditId] = useState(entry?.id);
  const [keepAdding, setKeepAdding] = useState(false);
  const [inlineTopic, setInlineTopic] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState<DictionaryEntry>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setAudioUrl(''); setAudioError('');
    if (audioFile) { objectUrl = URL.createObjectURL(audioFile); setAudioUrl(objectUrl); }
    else if (content.audio) dictionaryAudioUrl(content.audio).then(url => { if (active) setAudioUrl(url); }).catch(error => { if (active) setAudioError(errorMessage(error)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [audioFile, content.audio]);
  const update = <K extends keyof DictionaryContent>(key: K, value: DictionaryContent[K]) => setContent(previous => ({ ...previous, [key]: value }));
  const toggle = (key: 'topics' | 'lessons', id: string) => setContent(previous => ({ ...previous, [key]: previous[key].includes(id) ? previous[key].filter(value => value !== id) : [...previous[key], id] }));
  const save = async (status: 'draft' | 'published') => {
    if (saving.current) return;
    const problems = validateDictionaryContent(content, status === 'published');
    if (status === 'published' && content.lessons.some(id => !lessons.some(lesson => lesson.id === id && lesson.level === content.course && lesson.status === 'published'))) problems.push('Bài học nguồn phải đã xuất bản và thuộc khóa học đã chọn.');
    const existing = entries.find(value => value.id !== editId && [value, ...(value.draft ? [value.draft] : [])].some(candidate => dictionaryDuplicateKey(candidate) === dictionaryDuplicateKey(content)));
    setDuplicate(existing);
    if (existing) problems.push('Mục từ đã tồn tại trong khóa học này. Mở mục đã có để bổ sung liên kết.');
    setErrors(problems); setNotice('');
    if (problems.length) return;
    saving.current = true; setBusy(true);
    try {
      const value = { ...content, word: content.word.trim(), meaning: content.meaning.trim(), article: content.type === 'noun' ? content.article : '', plural: content.type === 'noun' ? content.plural : '', inflection: ['verb', 'adjective'].includes(content.type) ? content.inflection : '' };
      if (audioFile) { value.audio = await adminUploadDictionaryAudio(audioFile); setContent(value); setAudioFile(null); }
      const id = await adminSaveDictionaryEntry(value, status, editId);
      setEditId(id);
      await onSaved();
      if (keepAdding) { setContent(blankDictionaryContent(value)); setEditId(undefined); setAudioFile(null); setNotice('Đã lưu. Có thể tiếp tục thêm từ mới.'); }
      else onClose();
    } catch (error) { setErrors([errorMessage(error)]); }
    finally { saving.current = false; setBusy(false); }
  };
  const textField = (key: 'word' | 'meaning' | 'plural' | 'inflection' | 'ipa' | 'example' | 'translation', label: string, multiline = false) => <label className="block space-y-1 text-sm font-medium">{label}{multiline ? <textarea className={inputClass} rows={3} value={content[key]} maxLength={2000} onChange={event => update(key, event.target.value)} /> : <input className={inputClass} value={content[key]} maxLength={key === 'word' ? 240 : 2000} onChange={event => update(key, event.target.value)} />}</label>;
  return <div className="space-y-4">
    <Button variant="ghost" onClick={onClose} disabled={busy}><ArrowLeft size={16} className="mr-2" />Danh sách từ vựng</Button>
    <h2 className="text-xl font-bold">{editId ? 'Chỉnh sửa từ vựng' : 'Thêm từ vựng'}</h2>
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!!errors.length && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700"><ul className="list-disc pl-4">{errors.map(error => <li key={error}>{error}</li>)}</ul>{duplicate && <Button variant="secondary" size="sm" className="mt-2" onClick={() => onOpen(duplicate)}>Mở mục đã có</Button>}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <fieldset disabled={busy} className={`${panelClass} min-w-0 space-y-5`}>
        <legend className="sr-only">Thông tin từ vựng</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {textField('word', 'Từ / cụm từ tiếng Đức *')}
          <label className="block space-y-1 text-sm font-medium">Loại từ *<select className={inputClass} value={content.type} onChange={event => setContent(previous => ({ ...previous, type: event.target.value as DictionaryContent['type'], article: '', plural: '', inflection: '' }))}><option value="">Chọn loại từ</option>{Object.entries(DICTIONARY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {content.type === 'noun' && <><label className="block space-y-1 text-sm font-medium">Mạo từ *<select className={inputClass} value={content.article} onChange={event => update('article', event.target.value)}><option value="">Chọn mạo từ</option>{['der', 'die', 'das'].map(value => <option key={value}>{value}</option>)}</select></label>{textField('plural', 'Dạng số nhiều')}</>}
          {['verb', 'adjective'].includes(content.type) && textField('inflection', 'Dạng biến đổi')}
          {textField('meaning', 'Nghĩa tiếng Việt *')}{textField('ipa', 'Phiên âm IPA')}
        </div>
        <label className="block space-y-1 text-sm font-medium">Audio (tùy chọn)<input className={inputClass} type="file" accept=".mp3,.wav,.ogg,.m4a,.webm,audio/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 25 * 1024 * 1024) { setErrors(['Audio tối đa 25 MiB.']); event.target.value = ''; return; } setAudioFile(file); }} /><span className="block text-xs text-slate-500">MP3, WAV, OGG, M4A hoặc WebM · tối đa 25 MiB</span></label>
        {(content.audio || audioFile) && <Button size="sm" variant="ghost" onClick={() => { update('audio', null); setAudioFile(null); }}>Bỏ audio</Button>}
        <div className="grid gap-4 sm:grid-cols-2">{textField('example', 'Ví dụ tiếng Đức', true)}{textField('translation', 'Bản dịch tiếng Việt', true)}</div>
        <label className="block space-y-1 text-sm font-medium">Khóa học *<select className={inputClass} value={content.course} onChange={event => setContent(previous => ({ ...previous, course: event.target.value as Level, lessons: [] }))}>{(['A1', 'A2', 'B1', 'B2'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
        <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Chủ đề *</h3><Button size="sm" variant="ghost" onClick={() => setInlineTopic(!inlineTopic)}><Plus size={14} className="mr-1" />Thêm chủ đề</Button></div><div className="flex flex-wrap gap-2">{topics.map(topic => <label key={topic.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={content.topics.includes(topic.id)} onChange={() => toggle('topics', topic.id)} />{topic.vi}</label>)}</div>{!topics.length && <p className="text-sm text-slate-500">Chưa có chủ đề.</p>}
          {inlineTopic && <div className="mt-3 rounded-lg bg-slate-50 p-3"><TopicForm inline order={topics.length + 1} onSaved={topic => { onTopic(topic); setContent(previous => ({ ...previous, topics: [...new Set([...previous.topics, topic.id])] })); setInlineTopic(false); }} onCancel={() => setInlineTopic(false)} /></div>}
        </div>
        <div><h3 className="mb-2 text-sm font-semibold">Bài học nguồn *</h3><div className="max-h-56 space-y-2 overflow-y-auto">{lessons.filter(lesson => lesson.level === content.course).map(lesson => <label key={lesson.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={content.lessons.includes(lesson.id)} onChange={() => toggle('lessons', lesson.id)} />{lesson.title_vi}{lesson.status !== 'published' && <span className="text-amber-700">(Nháp)</span>}</label>)}</div>{!lessons.some(lesson => lesson.level === content.course) && <p className="text-sm text-slate-500">Khóa học chưa có bài học.</p>}</div>
      </fieldset>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Xem trước phía học viên</p><div className={`${panelClass} break-words`}><span className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700">{content.type ? DICTIONARY_TYPES[content.type] : 'Loại từ'}</span><h3 className="mt-4 text-3xl font-bold"><span className="text-orange-600">{content.type === 'noun' && content.article} </span>{content.word || 'Từ tiếng Đức'}</h3><p className="mt-2 text-sm text-slate-500">{content.ipa}</p>{audioUrl && <audio className="mt-3 w-full" controls src={audioUrl} preload="none" />}{audioError && <p role="alert" className="text-sm text-red-600">Không tải được audio: {audioError}</p>}<p className="my-5 text-lg">{content.meaning || 'Nghĩa tiếng Việt'}</p>{content.type === 'noun' && content.plural && <p className="text-sm text-slate-500">Số nhiều: {content.plural}</p>}{['verb', 'adjective'].includes(content.type) && content.inflection && <p className="text-sm text-slate-500">{content.inflection}</p>}{(content.example || content.translation) && <blockquote className="mt-4 border-l-2 border-orange-500 pl-3"><p>{content.example}</p><p className="mt-1 text-sm text-slate-500">{content.translation}</p></blockquote>}<div className="mt-4 flex flex-wrap gap-2">{topics.filter(topic => content.topics.includes(topic.id)).map(topic => <span key={topic.id} className="rounded bg-slate-100 px-2 py-1 text-xs">{topic.vi} · {topic.de}</span>)}</div><p className="mt-5 text-xs font-semibold uppercase text-slate-500">Bài học nguồn · {content.course}</p>{lessons.filter(lesson => content.lessons.includes(lesson.id)).map(lesson => <p key={lesson.id} className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">{lesson.title_vi}</p>)}</div><p className="text-sm text-slate-500">Lưu nháp chỉ cần từ tiếng Đức. Bản chỉnh sửa nháp không thay đổi nội dung đã xuất bản; học viên thấy nội dung mới sau khi xuất bản lại.</p></aside>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={keepAdding} disabled={busy} onChange={event => setKeepAdding(event.target.checked)} />Tiếp tục thêm từ sau khi lưu</label><div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void save('draft')}>Lưu nháp</Button><Button disabled={busy} onClick={() => void save('published')}>{busy && <Loader2 size={16} className="mr-2 animate-spin" />}Xuất bản</Button></div></div>
  </div>;
}

export const AdminDictionarySection: React.FC = () => {
  const [data, setData] = useState<{ entries: DictionaryEntry[]; topics: DictionaryTopic[]; lessons: DictionaryLesson[] }>({ entries: [], topics: [], lessons: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'words' | 'topics' | 'editor'>('words');
  const [entry, setEntry] = useState<DictionaryEntry>();
  const [editorKey, setEditorKey] = useState(0);
  const [topicEdit, setTopicEdit] = useState<DictionaryTopic>();
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const importLock = useRef(false);
  const load = async () => { setData(await adminLoadDictionary()); };
  useEffect(() => { let active = true; adminLoadDictionary().then(value => { if (active) setData(value); }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const open = (value?: DictionaryEntry) => { setEntry(value); setEditorKey(previous => previous + 1); setView('editor'); setError(''); setNotice(''); };
  const saveTopic = (topic: DictionaryTopic) => setData(previous => ({ ...previous, topics: [...previous.topics.filter(value => value.id !== topic.id), topic].sort((a, b) => a.order - b.order || a.vi.localeCompare(b.vi)) }));
  const rows = data.entries.filter(value => matchesDictionarySearch(value.draft ?? value, query) && (!topicFilter || (value.draft ?? value).topics.includes(topicFilter)) && (!status || value.status === status || (status === 'draft' && value.draft)));
  if (loading) return <div className="flex items-center gap-2 p-8 text-slate-500" role="status"><Loader2 className="animate-spin" size={20} />Đang tải từ điển…</div>;
  return <section className="space-y-5">
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}<Button variant="ghost" size="sm" onClick={async () => { try { await load(); setError(''); } catch (error) { setError(errorMessage(error)); } }}>Tải lại</Button></div>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {view === 'editor' ? <DictionaryEditor key={editorKey} entry={entry} {...data} onTopic={saveTopic} onSaved={load} onClose={() => setView('words')} onOpen={open} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpen size={24} />Từ điển</h1>{view === 'words' && <Button disabled={importing} onClick={() => open()}><Plus size={16} className="mr-2" />Thêm từ vựng</Button>}</div>
      <nav className="flex gap-2" aria-label="Quản lý từ điển"><Button variant={view === 'words' ? 'primary' : 'secondary'} disabled={importing} onClick={() => setView('words')}>Từ vựng</Button><Button variant={view === 'topics' ? 'primary' : 'secondary'} disabled={importing} onClick={() => setView('topics')}>Chủ đề</Button></nav>
      {view === 'words' ? <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4"><Button variant="secondary" size="sm" disabled={importing} onClick={async () => { if (importLock.current) return; importLock.current = true; setImporting(true); setError(''); setNotice(''); try { const result = await adminImportLessonVocabulary(); await load(); setNotice(`Đã thêm ${result.added} bản nháp, bỏ qua ${result.skipped} mục đã có và tạo ${result.topics} chủ đề.`); } catch (error) { setError(errorMessage(error)); } finally { importLock.current = false; setImporting(false); } }}>{importing && <Loader2 size={14} className="mr-2 animate-spin" />}Thu thập từ bài học</Button><p className="max-w-xl text-xs text-slate-500">Thu thập từ được đánh dấu trong nội dung từ vựng của bài học đã xuất bản để tạo bản nháp. Không đoán nghĩa, loại từ hoặc IPA còn thiếu; cần duyệt trước khi xuất bản.</p></div>
        <div className="flex flex-wrap gap-3"><input className={`${inputClass} sm:flex-1 sm:w-auto`} placeholder="Tìm từ tiếng Đức / nghĩa tiếng Việt" aria-label="Tìm từ vựng" value={query} onChange={event => setQuery(event.target.value)} /><select className={`${inputClass} sm:w-auto`} aria-label="Lọc chủ đề" value={topicFilter} onChange={event => setTopicFilter(event.target.value)}><option value="">Tất cả chủ đề</option>{data.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.vi}</option>)}</select><select className={`${inputClass} sm:w-auto`} aria-label="Lọc trạng thái" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="draft">Nháp</option><option value="published">Đã xuất bản</option></select></div>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Từ vựng</th><th className="p-4">Chủ đề</th><th className="p-4">Bài học</th><th className="p-4">Trạng thái</th><th className="p-4">Thao tác</th></tr></thead><tbody>{rows.map(value => { const content = value.draft ?? value; return <tr key={value.id} className="border-t border-slate-100"><td className="p-4"><p className="font-semibold">{content.type === 'noun' && content.article} {content.word}</p><p>{content.meaning || 'Chưa có nghĩa'}</p><p className="text-xs text-slate-500">{content.type && DICTIONARY_TYPES[content.type]} · {content.course}</p></td><td className="p-4">{data.topics.filter(topic => content.topics.includes(topic.id)).map(topic => topic.vi).join(', ') || '—'}</td><td className="p-4">{content.lessons.length} bài</td><td className="p-4"><span className={value.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>{value.status === 'published' ? 'Đã xuất bản' : 'Nháp'}</span>{value.draft && <p className="text-xs text-amber-700">Có chỉnh sửa nháp</p>}</td><td className="p-4"><Button variant="ghost" size="sm" onClick={() => open(value)}><Pencil size={14} className="mr-1" />Sửa</Button></td></tr>; })}</tbody></table>{!rows.length && <p className="p-8 text-center text-sm text-slate-500">Không tìm thấy mục từ phù hợp.</p>}</div><p role="status" className="text-xs text-slate-500">{rows.length} / {data.entries.length} mục từ</p>
      </> : <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Thứ tự</th><th className="p-4">Chủ đề</th><th className="p-4">Từ đã xuất bản</th><th className="p-4">Thao tác</th></tr></thead><tbody>{data.topics.map(topic => <tr key={topic.id} className="border-t border-slate-100"><td className="p-4">{topic.order}</td><td className="p-4"><p className="font-semibold">{topic.vi}</p><p className="text-slate-500">{topic.de}</p></td><td className="p-4">{data.entries.filter(value => value.status === 'published' && value.topics.includes(topic.id)).length}</td><td className="p-4"><Button variant="ghost" size="sm" onClick={() => setTopicEdit(topic)}>Sửa</Button></td></tr>)}</tbody></table>{!data.topics.length && <p className="p-5 text-sm text-slate-500">Chưa có chủ đề.</p>}</div><div className={`${panelClass} space-y-4`}><h2 className="font-semibold">{topicEdit ? 'Chỉnh sửa chủ đề' : 'Thêm chủ đề'}</h2><TopicForm key={topicEdit?.id ?? 'new'} topic={topicEdit} order={data.topics.length + 1} onSaved={topic => { saveTopic(topic); setTopicEdit(undefined); setNotice('Đã lưu chủ đề.'); }} onCancel={topicEdit ? () => setTopicEdit(undefined) : undefined} /><p className="text-xs text-slate-500">Chỉ chủ đề có từ đã xuất bản mới xuất hiện cho học viên. Số lượng không tính bản nháp.</p></div></div>}
    </>}
  </section>;
};
