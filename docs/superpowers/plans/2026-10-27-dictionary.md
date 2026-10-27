# Dictionary Implementation Plan

**Goal:** Implement the current Notion dictionary task using its supplied User/Admin design.
**Architecture:** Structured Supabase catalog, separate private drafts, learner-owned bookmarks, private audio. Reuse existing navigation, Button and Supabase client.
**Tech Stack:** React, TypeScript, Supabase/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-10-27-dictionary-design.md

## Constraints and review focus
No invented content, no draft leak, published content stable until republish, course access enforced in RLS, duplicate-safe concurrent writes, owned bookmarks, safe audio paths, no unrelated local changes committed.

## Tasks
- [x] Write failing dictionary model tests for accent/umlaut search, validation and highlight collection; implement src/lib/dictionaryModel.ts and tests.
- [x] Add schema/migration and database tests: four tables, RLS, validation, atomic publish, private audio and trigger ACL. Verify locally before production.
- [x] Add src/lib/dictionary.ts data operations following posts.ts, including paged reads, atomic publication, bookmarks, import and audio.
- [x] Add DictionaryPage and AdminDictionarySection with source UI behavior. Wire router, App, mobile/sidebar and admin ACL/navigation after impact analysis.
- [x] Verify unit suite, lint/build, SQL assertions and browser behavior. Request independent code review, run GitNexus detect_changes, commit/push only task files.
- [ ] Request explicit approval for this new production schema only after implementation is concrete, validated and reviewable. Move Notion to review after delivery is complete.

## Verification — 27 October 2026
- `npm test`: 338 passing; `npm run lint` and `npm run build` pass (existing bundle-size warning).
- PostgreSQL local: 25 RLS/publishing/audio assertions pass; checked-in `dictionary_rls_test.sql` also runs with assertion-compatible TAP helpers in PGlite. Full linked Supabase test runner was not run against production.
- Browser with local service fixtures: search without accents, bookmarks, source links, published draft isolation/republish, draft filter, topic creation, publish validation, keep-adding, desktop split and 390px stacked layout verified.
- Independent review found import identity changed after editorial enrichment; fixed using source provenance and regression-tested against both live entries and pending drafts.
- Production read-only preflight confirms the new dictionary tables/bucket are absent. Applying `course_dictionary` was rejected by automatic approval review: production schema approval was only for the earlier speaking/reveal migrations. No production change occurred. Explicit approval is still required for this new schema; keep Notion in progress.
