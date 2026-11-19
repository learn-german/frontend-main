# Editable meeting capacity

Source: Notion 40292cf518d88042901ece1d0ef21413. Admin must change the current fixed ten participants per session.

Reuse session create/edit form with a positive integer max_participants (DB) / maxParticipants (DTO), default 10 for existing/new sessions. Learner availability, registration button, counts, progress, and server capacity check must use the saved limit. Keep atomic registration parent-row locking, weekly restriction and service-only RPC. Reject reducing capacity below existing registration count; do not remove registrations. Nearly-full status starts at 80 percent. No global setting or unrelated eligibility changes.

Approach: one column + existing shared helper/callers, not a separate settings service. User authorized autonomous implementation/review/PR/merge and necessary migrations without routine questions.
