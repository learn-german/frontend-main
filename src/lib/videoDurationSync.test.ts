import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatDurationClock,parseDurationSeconds} from './lessonDuration';

for (const started of [false,true]) test(`metadata cannot change form after upload (started before effect: ${started})`, async () => {
  const source=readFileSync(new URL('../pages/admin/AdminLessonEditor.tsx',import.meta.url),'utf8');
  const start=source.indexOf('  useEffect(() => {');
  const effect=source.slice(start,source.indexOf('  const handleVideoUpload',start));
  let resolve!: (seconds:number)=>void;
  const metadata=new Promise<number>(done=>{resolve=done;});
  const updates:unknown[]=[];
  const writes:unknown[]=[];
  const revision={current:started?1:0};
  new Function('useEffect','data','initial','videoPlaybackUrl','videoRevisionRef','readVideoUrlDurationSeconds','formatDurationClock','parseDurationSeconds','upd','syncLessonVideoDuration','showToast',effect)(
    (callback:()=>void)=>callback(),{id:'lesson',video_r2_key:'old.mp4',duration:'14:22'}, {video_r2_key:'old.mp4'},'old-url',revision,
    ()=>metadata,formatDurationClock,parseDurationSeconds,(patch:unknown)=>updates.push(patch),(...args:unknown[])=>{writes.push(args);return Promise.resolve('05:40');},()=>{}
  );
  revision.current++;
  resolve(340);
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(updates,[]);
  assert.deepEqual(writes,[]);
});
