import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { practiceSearchKey, practiceTopicSummary, practiceLesson } from './practice';
test('practice search handles Vietnamese accents and đ', () => {
  assert.equal(practiceSearchKey('Động từ và đại từ'), 'dong tu va dai tu');
});
test('topic summary counts questions and completed submissions without counting drafts', () => {
  assert.deepEqual(practiceTopicSummary([{ id:'a', question_count:3 },{ id:'b', question_count:2 }], new Set(['a'])), { sets:2, questions:5, completed:1 });
});

test('practice listening lesson carries published set audio to existing runner', () => {
  const lesson = practiceLesson({ topic_id:'topic',topic_title:'T',topic_title_vi:'T',level:'A1',category:'nghe',order_index:0,sets:[{id:'set',lesson_id:'topic',category:'nghe',title:'S',order_index:0,status:'published',question_count:1,audio_clip_id:'clip',audio_r2_key:'audio/clip.mp3'}] });
  assert.deepEqual(lesson.listeningClips, [{id:'clip',r2Key:'audio/clip.mp3'}]);
});
