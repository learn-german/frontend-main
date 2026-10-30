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
- [x] Run full unit suite, backend attempt tests, TypeScript/build, database policy tests and scoped diff review; run GitNexus detect_changes before commit.
- [x] Commit only task files and push HEAD to main; verify remote commit and CI status. Keep safety stash and original local changes.

## Validation and rollout
- 333 frontend unit tests, 22 backend attempt tests, TypeScript and production build passed.
- Migration executed on local PGlite; 14 checked-in SQL assertions executed using assertion-compatible TAP helpers. Actual Supabase Storage upload and multi-connection concurrency were not exercised.
- Browser fixture verified two-attempt limit, grading an earlier submission, and learner score/feedback display. No production test records created.
- After explicit user approval, applied both migrations to production Deutsch: speaking_submissions (20261025034943), answer_reveal_after_three (20261025034950). Both previously blocked attempts now have revealed=true; no remaining unrevealed attempt has attempt_count >= 3.
- Post-deploy advisor found explicit default EXECUTE grants on the two new trigger functions. Applied speaking_trigger_privileges (20261025035058) to revoke client RPC access from PUBLIC/anon/authenticated; normal trigger execution verified afterward.
- Eighteen behavioral assertions passed on production PostgreSQL inside a rolled-back transaction: cap, ownership/staff RLS, grading, notifications, cleanup policy predicates and trigger ACL. Zero test users/submissions remain. No new security advisor findings remain relative to the pre-deploy baseline.
- Migration filenames synchronized to production history versions. Actual authenticated binary upload/playback has not been exercised; no test learner session was available.
- Optional recording expiry and in-browser microphone capture excluded per spec. Unrelated local work preserved, safety stash retained.
