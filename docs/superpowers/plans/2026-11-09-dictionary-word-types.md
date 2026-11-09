# Plan

1. Test both new type labels, valid publication and invalid type rejection.
2. Extend shared type map and dictionary_entries_type_check in a new migration.
3. SQL regression: both new types save/publish/read/update, invalid type remains rejected; rollback fixtures.
4. Full frontend tests, TypeScript/build and independent review; apply reviewed migration with Supabase connector, verify, PR/merge, Notion review.
