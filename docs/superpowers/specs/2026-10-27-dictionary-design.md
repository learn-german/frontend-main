# Course dictionary

Source: Notion task 40092cf518d880dba0fcec4d4cffa888 and supplied deutschselbst-dictionary-ui.zip README/User/Admin fragments (21 October 2026). User delegated execution and permits package downloads; prior autonomous delivery preference remains in force.

## Intended behavior
- User navigation: Dictionary immediately after current lesson, mobile included. Default topic exploration, responsive 40/60 word/detail split, German/Vietnamese search (accentless Vietnamese and ae/oe/ue/ss), bookmarks synced per learner. Detail shows type, article/plural or inflection, IPA, audio when provided, bilingual example and linked source lessons.
- Admin-only dictionary navigation after Content: words/topics. Full provided form, live preview, multiple topics/source lessons filtered by course, inline topic creation, keep-adding preserves associations, duplicate detection opens existing entry.
- Draft saves require only a word; publication validates meaning, type, noun article, course, topics, matching published source lessons and complete optional example pair. Edits saved as draft to a published entry must not change the published row. Publication replaces the live row and removes the draft atomically.
- Topics have vi/de names and order; public topic counts include only visible published words. Audio stored privately, immutable unique paths, 25 MiB, same five audio formats as existing speaking upload.
- Authenticated learners see published entries for their active unlocked course levels, including future lessons. Trial sees A1 entries sourced from its first three published lessons; expired subscriptions see no course content. Admin/Tutor can read all course dictionaries; only Admin edits because existing Content is blocked to Tutor.

## Data and scope
Use new Supabase dictionary_topics, dictionary_entries, dictionary_entry_drafts, dictionary_bookmarks tables. Entry fields follow prototype: word,type,article,plural,inflection,meaning,ipa,example,translation,course,topics,lessons,status,audio. Draft payload stored separately with admin-only RLS so learners cannot select unpublished edits. Add database validation, duplicate uniqueness and an atomic publish RPC. No app dependency is needed.

Collect every {{highlighted word}} from current vocabulary_md in an Admin action, with section topic and source lesson; use explicit table/list meanings only, never fabricate meanings/IPA/type. Imported items are drafts for editorial review. Merge repeat occurrences and preserve existing entries. No automatic AI enrichment, Excel import or course-content rewriting.

## Approaches
Chosen: a small structured catalog with separate editable drafts and bookmarks, existing Supabase/React patterns. Directly parsing lesson Markdown on every learner load cannot supply editorial states or stable bookmarks; copying prototype scripts would retain demo storage and omit server authorization.

## Validation
Unit tests for search, import/duplicates and validation; PostgreSQL assertions for draft privacy, publishing, association validation, course access, bookmark ownership and audio policies. Browser tests cover User/Admin controls and mobile layout using fixtures. Preserve unrelated tracked/untracked local work and keep production writes separate from code preparation unless explicitly authorized for this new schema.
