# Meeting capacity implementation

1. Add regression tests for custom limits below/above ten, nearly-full ratio and invalid input.
2. Extend meeting DTO, mapper, create/edit input and all UI counts/status. Preserve all other meeting behavior.
3. Migration: positive integer capacity default ten, reject reductions below bookings, replace fixed RPC limit with target_session capacity. Keep privileges/locking unchanged. Add transactional SQL tests.
4. Include saved capacity in list Edge response/eligibility and tests. Update fixtures/generated DB types.
5. TypeScript, frontend/build, Edge and SQL checks; independent review, GitNexus scope check, PR/merge, production deploy, Notion review.
