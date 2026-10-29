import assert from 'node:assert/strict';
import test from 'node:test';
import { blankDictionaryContent, validateDictionaryContent, dictionarySearchKey, matchesDictionarySearch, dictionaryDuplicateKey, collectLessonVocabulary } from './dictionaryModel';

test('search accepts Vietnamese without accents and German umlaut replacements', () => {
  const entry = {...blankDictionaryContent(),word:'Mütter',meaning:'người mẹ'};
  assert.equal(matchesDictionarySearch(entry,'Muetter'),true);
  assert.equal(matchesDictionarySearch(entry,'nguoi me'),true);
  assert.equal(dictionarySearchKey('Straße'),dictionarySearchKey('Strasse'));
  assert.equal(matchesDictionarySearch(entry,'Vater'),false);
});
test('draft needs a word; publishing requires full associations and paired optional example', () => {
  const content=blankDictionaryContent();
  assert.ok(validateDictionaryContent(content,false).length);
  content.word='Mutter';
  assert.equal(validateDictionaryContent(content,false).length,0);
  assert.ok(validateDictionaryContent(content,true).length);
  Object.assign(content,{type:'noun',article:'die',meaning:'mẹ',topics:['topic'],lessons:['lesson']});
  assert.deepEqual(validateDictionaryContent(content,true),[]);
  content.example='Meine Mutter.';
  assert.ok(validateDictionaryContent(content,true).length);
});
test('publishing a noun accepts no article or a valid article but rejects invalid articles', () => {
  const noun = {...blankDictionaryContent(), word:'Wasser', type:'noun' as const, meaning:'nước', topics:['topic'], lessons:['lesson']};
  for (const article of ['', 'der', 'die', 'das']) {
    assert.deepEqual(validateDictionaryContent({...noun, article}, true), [], `article ${article || '(none)'}`);
  }
  assert.ok(validateDictionaryContent({...noun, article:'ein'}, true).length > 0);
  assert.ok(validateDictionaryContent({...noun, meaning:''}, true).length > 0);
});
test('duplicate identity includes course, type, article and meaning', () => {
  const value={...blankDictionaryContent(),word:' Mutter ',type:'noun' as const,article:'die',meaning:'mẹ'};
  assert.equal(dictionaryDuplicateKey(value),dictionaryDuplicateKey({...value,word:'mutter'}));
  assert.notEqual(dictionaryDuplicateKey(value),dictionaryDuplicateKey({...value,meaning:'người mẹ'}));
});
test('collects every highlighted term, explicit meanings and source topics without guessing', () => {
  const entries=collectLessonVocabulary([{id:'lesson',level:'A1',title_vi:'Bài học',status:'published',vocabulary_md:'## Chào hỏi\n- {{Hallo}} / {{Guten Tag}}: xin chào\n## Nghề nghiệp\n| Deutsch | Phiên âm IPA | Tiếng Việt |\n| --- | --- | --- |\n| {{der Arzt}} | [aːɐ̯tst] | bác sĩ |\n- Tôi {{wohne}} in Berlin.'}]);
  assert.equal(entries.length,4);
  assert.equal(entries.find(x=>x.word==='Hallo')?.meaning,'xin chào');
  const noun=entries.find(x=>x.word==='Arzt')!;
  assert.equal(noun.article,'der'); assert.equal(noun.topic,'Nghề nghiệp'); assert.equal(noun.meaning,'bác sĩ');
  assert.equal(entries.find(x=>x.word==='wohne')?.meaning,'');
  assert.equal(entries.find(x=>x.word==='wohne')?.type,'');
  assert.deepEqual(noun.lessons,['lesson']);
});

test('recollection preserves an enriched entry and respects a pending draft identity', async () => {
  const {planDictionaryImport}=await import('./dictionaryModel');
  const original={...blankDictionaryContent(),word:'Hallo',topics:['topic'],lessons:['lesson'],source_keys:['lesson:Hallo']};
  const edited={...original,id:'id',type:'phrase' as const,meaning:'xin chào',status:'published' as const,created_at:'',updated_at:''};
  const result=planDictionaryImport([original],[edited]);
  assert.equal(result.inserts.length,0);
  assert.equal(result.skipped,1);
  const pending={...edited,source_keys:[],draft:{...original,meaning:'xin chào'}};
  const sameDraft={...original,meaning:'xin chào'};
  assert.equal(planDictionaryImport([sameDraft],[pending]).inserts.length,0);
});
