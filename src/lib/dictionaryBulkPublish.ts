import type {DictionaryContent,DictionaryEntry} from './dictionaryModel';
type Publisher=(content:DictionaryContent,status:'published',id?:string)=>Promise<string>;
export async function publishDictionaryEntries(entries:DictionaryEntry[],publish:Publisher) {
  const published:string[]=[],failed:{id:string;message:string}[]=[];
  for(const entry of entries){
    if(entry.status==='published' && !entry.draft)continue;
    const content=entry.draft??entry;
    try {await publish(content,'published',entry.id);published.push(entry.id);}
    catch(error){const message=error&&typeof error==='object'&&'message' in error?String(error.message):'Xuất bản thất bại';failed.push({id:entry.id,message:`${content.word}: ${message}`});}
  }
  return {published,failed};
}
