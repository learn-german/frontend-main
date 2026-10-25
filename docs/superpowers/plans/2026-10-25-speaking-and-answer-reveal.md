# Speaking and Answer Reveal Implementation Plan

**Goal:** Complete the two in-progress Notion tasks.
**Architecture:** Existing Supabase client, private audio bucket, database-enforced cap and notifications; focused user/admin UI.
**Tech Stack:** React, TypeScript, Supabase/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-10-25-speaking-and-answer-reveal-design.md

## Global Constraints
Two speaking submissions per learner/lesson; five audio formats; 25 MiB; private ownership/staff access; integer score 0–100. Preserve unrelated local work.

## Review Focus
Cap bypass/concurrent submits; forged grades; cross-user audio access; failed upload/insert cleanup; grading older attempts and unchanged-score feedback notifications.

## Tasks
- [x] Add failing attempt-2/attempt-3 reveal tests in both setAttemptUpdate suites; change threshold to 3 and preserve all existing pass/XP tests.
- [x] Add audio validation tests, private bucket/table migration with cap and notification triggers; verify with PostgreSQL-compatible local test harness and negative RLS cases.
- [x] Add learner upload/history/playback panel and Admin/Tutor grading section; wire navigation and notification targets. Reuse UI conventions, add no application dependencies.
- [ ] Run full unit suite, backend attempt tests, TypeScript/build, database policy tests and scoped diff review; run GitNexus detect_changes before commit.
- [ ] Commit only task files and push HEAD to main; verify remote commit and CI status. Keep safety stash and original local changes.

## Validation and rollout
- 333 frontend unit tests, 22 backend attempt tests, TypeScript and production build passed.
- Migration executed on local PGlite; 14 checked-in SQL assertions executed using assertion-compatible TAP helpers. Actual Supabase Storage upload and multi-connection concurrency were not exercised.
- Browser fixture verified two-attempt limit, grading an earlier submission, and learner score/feedback display. No production test records created.
- Automatic approval review rejected applying schema/RLS/bucket changes to live project Deutsch: user request to implement/push was not accepted as explicit authorization for production schema and permissions. Both migration files remain unapplied; speaking needs them before production use. No CI workaround added.
- Optional recording expiry and in-browser microphone capture excluded per spec. Unrelated local work preserved, safety stash retained.
