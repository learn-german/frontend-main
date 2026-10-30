# Video duration safety

Retain duration measurement in the admin editor; Save persists the measured duration with the selected video. Learners never write shared lesson metadata. Once a replacement upload starts, ignore all remote metadata for that editor session. Keep the legacy RPC admin-only because it already exists in production, and preserve three-digit minutes.

Use existing editor state and Save rather than a new synchronization API. Verify upload races with regression tests, permissions and formatting with SQL assertions, then review before merging PR #140.
