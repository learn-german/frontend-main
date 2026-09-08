# Task 3 Report — Meeting Edge Functions

## Status

DONE

## Implementation

- Added `list-learner-meetings` with authenticated subscription gating, upcoming-session sorting, registration counts, current VN-week registration, and conditional `meetUrl`.
- Added `register-meeting` with JWT verification, service-role database access, 10-seat capacity, Asia/Ho_Chi_Minh Monday–Sunday limits, explicit 401/403/404/409 codes, and post-insert invariant rechecks with compensating deletion.
- Added `cancel-meeting` to delete only the caller's registration and immediately free the seat/week slot.

## Validation

- `npm run lint` — passed.
- `deno check` for all three functions — passed.
- `deno fmt --check` for all three functions — passed.
- GitNexus index refreshed; `detect_changes --scope staged` ran before commit. New unindexed files produced no mapped existing-symbol changes.
- Supabase MCP `list_edge_functions` confirmed all three deployments ACTIVE, version 1, with `verify_jwt: true`.

## Deployment

- Supabase CLI could not deploy because no CLI access token was configured.
- Supabase MCP fallback deployed all three functions successfully to Deutsch project `awdhqlgxnjwymwgxltlw`.

## Commit

- `f2120d3 feat(meetings): add Edge Functions for list, register, cancel`

## Concerns

- None blocking. CLI credentials remain unavailable, but MCP deployment completed and was verified.

## Important Review Fix — Transaction-Safe Registration

- Added `20260904230000_register_meeting_session.sql` with
  `public.register_meeting_session(p_session_id, p_user_id)`.
- The RPC locks the target session for capacity serialization and the learner's
  profile row for cross-session weekly-limit serialization, then checks and
  inserts in one database transaction.
- The `SECURITY DEFINER` function pins `search_path = ''`, fully qualifies
  relations, revokes execution from `PUBLIC`, `anon`, and `authenticated`, and
  grants execution only to `service_role`.
- Updated `register-meeting` to retain its subscription check and replace all
  registration PostgREST calls plus compensating deletion with one service-role
  RPC call. Database errors map to `404 not_found` or `409`
  `already_registered` / `full` / `week_limit`.
- Supabase MCP applied migration `register_meeting_session` to Deutsch project
  `awdhqlgxnjwymwgxltlw`.
- Remote verification confirmed `SECURITY DEFINER`, empty `search_path`,
  service-role-only execution, the expected return shape including `meet_url`,
  and the `not_found` exception contract.
- Supabase MCP redeployed `register-meeting`: ACTIVE, version 2,
  `verify_jwt: true`.
- Validation passed: `npm run lint`, Deno format check, and Deno type check.
- Supabase advisors reported no new finding for
  `register_meeting_session`; existing unrelated project advisories remain.
