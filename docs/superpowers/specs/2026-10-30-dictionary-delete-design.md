# Dictionary deletion

Admin can delete an entry or an unused topic with an explicit confirmation dialog following the existing posts UI. Entry deletion cascades saved drafts/bookmarks through existing foreign keys; do not remove binary audio. Block topic deletion when any entry or saved draft references it. Enforce authorization and reference checks in the DB, including concurrent entry writes, rather than trusting UI state. Reuse Supabase delete with returned row to detect denied/missing records.
