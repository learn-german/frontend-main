BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);
SET LOCAL "request.jwt.claims"='{"app_metadata":{"role":"admin"}}';
INSERT INTO public.modules(id,level,title,title_vi,order_index)
VALUES ('word-types-test-module','A1','Test','Test',-1000);
INSERT INTO public.lessons(id,module_id,level,title,title_vi,status,order_index)
VALUES ('word-types-test-lesson','word-types-test-module','A1','Test','Test','published',1);
SET LOCAL ROLE authenticated;
INSERT INTO public.dictionary_topics(id,vi,de)
VALUES ('ac8b7df0-e523-4f3e-955c-602857cebc98','Word types regression test','Test');
SELECT lives_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-heute","type":"adverb","course":"A1"}','draft')$$,'adverb draft can be saved');
SELECT lives_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-mit","type":"preposition","course":"A1"}','draft')$$,'preposition draft can be saved');
SELECT lives_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-heute","type":"adverb","meaning":"hôm nay","course":"A1","topics":["ac8b7df0-e523-4f3e-955c-602857cebc98"],"lessons":["word-types-test-lesson"]}','published',(SELECT id FROM public.dictionary_entries WHERE word='word-types-test-heute'))$$,'adverb can be published');
SELECT lives_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-mit","type":"preposition","meaning":"với","course":"A1","topics":["ac8b7df0-e523-4f3e-955c-602857cebc98"],"lessons":["word-types-test-lesson"]}','published',(SELECT id FROM public.dictionary_entries WHERE word='word-types-test-mit'))$$,'preposition can be published');
SELECT is((SELECT type FROM public.dictionary_entries WHERE word='word-types-test-heute'),'adverb','published adverb retains its type');
SELECT is((SELECT type FROM public.dictionary_entries WHERE word='word-types-test-mit'),'preposition','published preposition retains its type');
SELECT throws_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-invalid","type":"invalid","course":"A1"}','draft')$$,'23514',NULL,'unknown types stay rejected');
SELECT throws_ok($$SELECT public.save_dictionary_entry('{"word":"word-types-test-incomplete","type":"adverb","course":"A1"}','published')$$,'23514',NULL,'new types still require complete publication content');
SELECT * FROM finish();
ROLLBACK;
