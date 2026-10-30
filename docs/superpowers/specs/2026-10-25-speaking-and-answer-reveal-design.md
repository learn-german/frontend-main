# Speaking submissions and answer reveal

Source: Notion tasks 40292cf518d88092bdfec0fd2f0bac6f and 40292cf518d880ba8e79ea3e484ce2de, read through Chrome on 2026-10-25.

- Reveal answers, explanations and listening transcription after attempt 3. Preserve early reveal on passing and sticky reveal/XP rules. Apply to grammar/listening and reading.
- Learners upload a recording made on their device: MP3/M4A/WAV/WEBM/OGG, nonempty, at most 25 MiB. Optional teacher note. Maximum two submitted recordings per lesson/user, enforced in PostgreSQL as well as UI.
- Learners can replay their recordings and see score (integer 0–100), feedback and submission history. Admin/Tutor can listen and grade either attempt. Notify staff on submission and the learner on grading, with navigation to the matching section.
- Use the existing Supabase client and notifications table. Store binary audio in a private Storage bucket, metadata in speaking_submissions. Owner and staff only can read; students cannot grade, edit or delete submissions. Serialize insertion per learner to prevent concurrent cap bypass.
- Keep files for grading/history. Optional two-week deletion and in-browser recording are outside this task; Notion asks learners to record and upload a file.

## Approaches
Reuse Supabase Storage with RLS (chosen by implementer: no new API or credentials) versus extend the admin-only R2 upload/signing routes (more custom authorization). Keep writing UI unchanged and add a focused speaking panel and grading section following its patterns.

User explicitly requested autonomous implementation and push to main without further questions. Preserve unrelated existing local work.
