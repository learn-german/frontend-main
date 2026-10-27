import { supabase } from './supabase';
import { speakingContentType, validateSpeakingFile } from './speaking';
import { collectLessonVocabulary, dictionaryDuplicateKey, planDictionaryImport, validateDictionaryContent,
  type DictionaryContent, type DictionaryEntry, type DictionaryTopic, type DictionaryLesson } from './dictionaryModel';

const AUDIO_BUCKET='dictionary-audio';
async function rows<T>(table:string,columns='*',published=false):Promise<T[]> {
  const result:T[]=[];
  for(let offset=0;;offset+=500){
    let query=supabase.from(table).select(columns).order(table==='dictionary_entry_drafts'?'entry_id':'id').range(offset,offset+499);
    if(published)query=query.eq('status','published');
    const {data,error}=await query;if(error)throw error;
    result.push(...(data??[]) as T[]);if(!data||data.length<500)return result;
  }
}
export async function loadDictionary(){
  const [entries,topics]=await Promise.all([rows<DictionaryEntry>('dictionary_entries','*',true),rows<DictionaryTopic>('dictionary_topics')]);
  return {entries,topics:topics.sort((a,b)=>a.order-b.order||a.vi.localeCompare(b.vi))};
}
export async function loadDictionaryLessons():Promise<DictionaryLesson[]> {
  return rows<DictionaryLesson>('lessons','id,level,title_vi,status',true);
}
export async function loadDictionaryBookmarks(userId:string):Promise<string[]> {
  const result:string[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await supabase.from('dictionary_bookmarks').select('entry_id').eq('user_id',userId).order('entry_id').range(offset,offset+499);
    if(error)throw error;result.push(...(data??[]).map(r=>r.entry_id as string));if(!data||data.length<500)return result;
  }
}
export async function setDictionaryBookmark(userId:string,entryId:string,saved:boolean):Promise<void> {
  const {error}=saved?await supabase.from('dictionary_bookmarks').upsert({user_id:userId,entry_id:entryId},{onConflict:'user_id,entry_id',ignoreDuplicates:true})
    :await supabase.from('dictionary_bookmarks').delete().eq('user_id',userId).eq('entry_id',entryId);
  if(error)throw error;
}
export async function dictionaryAudioUrl(path:string):Promise<string> {
  const {data,error}=await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path,3600);
  if(error)throw error;return data.signedUrl;
}
export async function adminLoadDictionary(){
  const [entries,topics,lessons,drafts]=await Promise.all([
    rows<DictionaryEntry>('dictionary_entries'),rows<DictionaryTopic>('dictionary_topics'),
    rows<DictionaryLesson>('lessons','id,level,title_vi,status'),
    rows<{entry_id:string;content:DictionaryContent}>('dictionary_entry_drafts'),
  ]);
  const draftById=new Map(drafts.map(d=>[d.entry_id,d.content]));
  return {entries:entries.map(e=>({...e,draft:draftById.get(e.id)})),topics:topics.sort((a,b)=>a.order-b.order),lessons};
}
export async function adminSaveDictionaryEntry(content:DictionaryContent,status:'draft'|'published',id?:string):Promise<string> {
  const clean={...content,word:content.word.trim(),meaning:content.meaning.trim(),topics:[...new Set(content.topics)],lessons:[...new Set(content.lessons)],
    article:content.type==='noun'?content.article:'',plural:content.type==='noun'?content.plural:''};
  const errors=validateDictionaryContent(clean,status==='published');if(errors.length)throw new Error(errors.join(' '));
  const {data,error}=await supabase.rpc('save_dictionary_entry',{p_content:clean,p_status:status,p_id:id??null});
  if(error)throw error;return data as string;
}
export async function adminSaveDictionaryTopic(value:{vi:string;de:string;order:number},id?:string):Promise<DictionaryTopic> {
  const content={vi:value.vi.trim(),de:value.de.trim(),order:value.order};
  if(!content.vi || content.vi.length>160 || content.de.length>160 || !Number.isInteger(content.order)||content.order<1||content.order>9999)throw new Error('Kiểm tra tên và thứ tự chủ đề (1–9999).');
  const query=id?supabase.from('dictionary_topics').update(content).eq('id',id):supabase.from('dictionary_topics').insert(content);
  const {data,error}=await query.select('*').single();if(error)throw error;return data as DictionaryTopic;
}
export async function adminUploadDictionaryAudio(file:File):Promise<string> {
  const validation=validateSpeakingFile(file);if(validation)throw new Error(validation);
  const {data:{user},error}=await supabase.auth.getUser();if(error)throw error;if(!user)throw new Error('Chưa đăng nhập.');
  const path=`${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()!.toLowerCase()}`;
  const result=await supabase.storage.from(AUDIO_BUCKET).upload(path,file,{contentType:speakingContentType(file.name),upsert:false});
  if(result.error)throw result.error;return path;
}
export async function adminImportLessonVocabulary():Promise<{added:number;skipped:number;topics:number}> {
  const [catalog,lessons]=await Promise.all([adminLoadDictionary(),rows<DictionaryLesson>('lessons','id,level,title_vi,status,vocabulary_md',true)]);
  const candidates=collectLessonVocabulary(lessons);
  const topics=new Map(catalog.topics.map(t=>[t.vi.trim().toLowerCase(),t]));
  let newTopics=0;
  for(const candidate of candidates){
    const vi=candidate.topic.slice(0,160).trim();const key=vi.toLowerCase();
    if(!topics.has(key)){const topic=await adminSaveDictionaryTopic({vi,de:'',order:catalog.topics.length+(++newTopics)});topics.set(key,topic);}
  }
  const collected=new Map<string,DictionaryContent & {source_keys:string[]}>();
  for(const {topic,source_key,...value} of candidates){
    const candidate={...value,topics:[topics.get(topic.slice(0,160).trim().toLowerCase())!.id],source_keys:[source_key]};
    const key=dictionaryDuplicateKey(candidate),existing=collected.get(key);
    if(existing){existing.topics=[...new Set([...existing.topics,...candidate.topics])];existing.lessons=[...new Set([...existing.lessons,...candidate.lessons])];existing.source_keys=[...new Set([...existing.source_keys,source_key])];}
    else collected.set(key,candidate);
  }
  const {inserts,updates,skipped}=planDictionaryImport([...collected.values()],catalog.entries);
  for(const update of updates){
    if(update.associationsChanged)await adminSaveDictionaryEntry(update.content,'draft',update.id);
    const {error}=await supabase.from('dictionary_entries').update({source_keys:update.source_keys}).eq('id',update.id);
    if(error)throw error;
  }
  for(let i=0;i<inserts.length;i+=100){
    const {error}=await supabase.from('dictionary_entries').insert(inserts.slice(i,i+100).map(e=>({...e,status:'draft'})));
    if(error)throw error;
  }
  return {added:inserts.length,skipped,topics:newTopics};
}
