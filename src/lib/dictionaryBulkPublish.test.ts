import test from 'node:test';
import assert from 'node:assert/strict';
import {publishDictionaryEntries} from './dictionaryBulkPublish';
import {blankDictionaryContent,type DictionaryEntry} from './dictionaryModel';

test('publishes latest drafts, skips clean published entries and preserves per-entry failures',async()=>{
  const base={...blankDictionaryContent(),word:'Wasser',status:'draft' as const,created_at:'',updated_at:''};
  const entries:DictionaryEntry[]=[{...base,id:'1'},{...base,id:'2',status:'published',draft:{...blankDictionaryContent(),word:'Neu'}},{...base,id:'3',status:'published'},{...base,id:'4',word:'Bad'}];
  const saved:string[]=[];
  const result=await publishDictionaryEntries(entries,async(content,_status,id)=>{if(id==='4')throw {message:'incomplete'};saved.push(`${id}:${content.word}`);return id!;});
  assert.deepEqual(saved,['1:Wasser','2:Neu']);
  assert.deepEqual(result.published,['1','2']);
  assert.deepEqual(result.failed,[{id:'4',message:'Bad: incomplete'}]);
});
