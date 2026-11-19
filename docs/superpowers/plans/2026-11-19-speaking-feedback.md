# Speaking feedback plan

1. Tests before implementation: score0/text-only/audio-only/both, optional file validation, upload/update failures, replacement/removal cleanup warnings. Keep saved feedback unchanged on cancel by local-only drafts.
2. Add paired fields and secure feedback namespace/Storage policies; extend existing guard preserving immutable submission identity and two-attempt cap. Transactional SQL tests: forged inserts, wrong-attempt/missing object, graded0, owner/other/staff reads, attached deletion denied, unused deletion allowed.
3. Extend Admin save/local preview/remove/reset and name-click submission history. Extend learner per-attempt feedback and accessible audio labels/error handling. Reuse existing format validation and styling.
4. Lint, frontend suite/build, independent review, SQL rollback and cleanup proof, migration-history identity, GitNexus scope check, PR/merge/deploy and Notion review. Test UI without modifying real learner grades.
