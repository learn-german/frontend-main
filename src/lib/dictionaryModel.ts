import type { Level } from './appTypes';

export const DICTIONARY_TYPES = {noun:'Danh từ',verb:'Động từ',adjective:'Tính từ',phrase:'Cụm từ / giao tiếp'} as const;
export type DictionaryWordType = keyof typeof DICTIONARY_TYPES;
export interface DictionaryContent {
  word:string; type:DictionaryWordType|''; article:string; plural:string; inflection:string;
  meaning:string; ipa:string; example:string; translation:string; course:Level;
  topics:string[]; lessons:string[]; audio:string|null;
}
export interface DictionaryEntry extends DictionaryContent {
  id:string; status:'draft'|'published'; created_at:string; updated_at:string; draft?:DictionaryContent; source_keys?:string[];
}
export interface DictionaryTopic { id:string; vi:string; de:string; order:number; }
export interface DictionaryLesson { id:string; level:string; title_vi:string; status:string; vocabulary_md?:string|null; }
export interface DictionaryImportCandidate extends DictionaryContent {topic:string;source_key:string;}

export function blankDictionaryContent(context:Partial<DictionaryContent> = {}):DictionaryContent {
  return {word:'',type:'',article:'',plural:'',inflection:'',meaning:'',ipa:'',example:'',translation:'',course:context.course??'A1',topics:[...(context.topics??[])],lessons:[...(context.lessons??[])],audio:null};
}
export function dictionarySearchKey(value:string):string {
  return value.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
}
export function matchesDictionarySearch(entry:Pick<DictionaryContent,'word'|'meaning'>,query:string):boolean {
  return dictionarySearchKey(`${entry.word} ${entry.meaning}`).includes(dictionarySearchKey(query));
}
export function dictionaryDuplicateKey(entry:DictionaryContent):string {
  return [entry.course,entry.type,entry.type==='noun'?entry.article:'',entry.word.trim().toLowerCase(),entry.meaning.trim().toLowerCase()].join('\u001f');
}
export function validateDictionaryContent(value:DictionaryContent,publish:boolean):string[] {
  const errors:string[]=[];
  if(!value.word.trim()) errors.push('Nhập từ hoặc cụm từ tiếng Đức.');
  if(value.word.length>240 || value.meaning.length>2000 || value.example.length>2000 || value.translation.length>2000) errors.push('Nội dung vượt quá độ dài cho phép.');
  if(publish){
    if(!(value.type in DICTIONARY_TYPES)) errors.push('Chọn loại từ.');
    if(value.type==='noun' && !['der','die','das'].includes(value.article)) errors.push('Chọn mạo từ cho danh từ.');
    if(!value.meaning.trim()) errors.push('Nhập nghĩa tiếng Việt.');
    if(!value.topics.length) errors.push('Chọn ít nhất một chủ đề.');
    if(!value.lessons.length) errors.push('Chọn ít nhất một bài học nguồn.');
    if(!!value.example.trim()!==!!value.translation.trim()) errors.push('Ví dụ cần đủ câu tiếng Đức và bản dịch tiếng Việt.');
  }
  return errors;
}
const clean=(text:string)=>text.replace(/\{\{|\}\}|\*\*|`/g,'').replace(/<br\s*\/?\s*>/gi,' / ').trim();

export function collectLessonVocabulary(lessons:DictionaryLesson[]):DictionaryImportCandidate[] {
  const entries:DictionaryImportCandidate[]=[];
  for(const lesson of lessons){
    if(lesson.status!=='published') continue;
    let topic=lesson.title_vi;
    let headers:string[]=[];
    for(const line of (lesson.vocabulary_md??'').split('\n')){
      if(/^\s*#{1,6}\s/.test(line)){topic=clean(line.replace(/^\s*#{1,6}\s+/, '').replace(/^\d+(?:\.\d+)*\.?\s*/,''));headers=[];}
      const cells=line.trim().startsWith('|')?line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(clean):[];
      if(cells.length && !line.includes('{{') && cells.some(x=>/tiếng việt|nghĩa|deutsch|nguyên mẫu/i.test(x))){headers=cells;continue;}
      const meaningColumn=headers.findIndex(x=>/tiếng việt|nghĩa|vietnam/i.test(x));
      const germanColumn=headers.findIndex(x=>/deutsch|tiếng đức|nguyên mẫu|từ vựng/i.test(x));
      const rawCells=line.trim().startsWith('|')?line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/):[];
      for(const match of line.matchAll(/\{\{([^{}]+)\}\}/g)){
        const raw=clean(match[1]); if(!raw)continue;
        const noun=/^\(?(der|die|das)\)?\s+(.+)$/i.exec(raw);
        const cellIndex=rawCells.findIndex(x=>x.includes(match[0]));
        let meaning='';
        if(meaningColumn>=0 && germanColumn>=0 && cellIndex===germanColumn) meaning=cells[meaningColumn]??'';
        const colon=line.indexOf(':');
        if(!cells.length && colon>=0 && (match.index??0)<colon && /^\s*[-*]?\s*(?:\{\{[^{}]+\}\}\s*\/?\s*)+:/.test(line)) meaning=clean(line.slice(colon+1));
        const value:DictionaryImportCandidate={...blankDictionaryContent(),word:noun?.[2]??raw,article:noun?.[1].toLowerCase()??'',type:noun?'noun':/động từ|verben/i.test(topic)?'verb':/tính từ|adjektiv/i.test(topic)?'adjective':'',meaning,course:lesson.level as Level,lessons:[lesson.id],topic,source_key:JSON.stringify([lesson.id,raw,meaning])};
        if(cellIndex===germanColumn){const ipa=headers.findIndex(x=>/ipa|phiên âm/i.test(x));if(ipa>=0)value.ipa=cells[ipa]??'';}
        entries.push(value);
      }
    }
  }
  return entries;
}

type CollectedDictionaryContent = DictionaryContent & {source_keys:string[]};
export function planDictionaryImport(candidates:CollectedDictionaryContent[],entries:DictionaryEntry[]) {
  const inserts:CollectedDictionaryContent[]=[];
  const updates=new Map<string,{id:string;content:DictionaryContent;source_keys:string[];associationsChanged:boolean}>();
  const bySource=new Map(entries.flatMap(entry=>(entry.source_keys??[]).map(key=>[key,entry] as const)));
  const byIdentity=new Map(entries.flatMap(entry=>[entry,...(entry.draft?[entry.draft]:[])].map(content=>[dictionaryDuplicateKey(content),entry] as const)));
  let skipped=0;
  for(const candidate of candidates){
    const existing=candidate.source_keys.map(key=>bySource.get(key)).find(Boolean)??byIdentity.get(dictionaryDuplicateKey(candidate));
    if(!existing){inserts.push(candidate);continue;}
    const previous=updates.get(existing.id),base=previous?.content??existing.draft??existing;
    const topics=[...new Set([...base.topics,...candidate.topics])],lessons=[...new Set([...base.lessons,...candidate.lessons])];
    const source_keys=[...new Set([...(previous?.source_keys??existing.source_keys??[]),...candidate.source_keys])];
    updates.set(existing.id,{id:existing.id,content:{...base,topics,lessons},source_keys,
      associationsChanged:!!previous?.associationsChanged||topics.length!==base.topics.length||lessons.length!==base.lessons.length});
    skipped++;
  }
  return {inserts,updates:[...updates.values()],skipped};
}
