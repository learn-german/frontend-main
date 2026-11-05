# Dashboard XP encouragement copy

Scope approved in chat on 2026-11-05. In the Dashboard total XP card, when `stats.xp < 5000`, display exactly: “Mỗi bài học là một bước tiến! Chinh phục 5.000 XP để mở khóa phần thưởng 300.000đ dành cho sự kiên trì của bạn!”

Reuse the current paragraph, typography and bold styling for `5.000 XP` and `300.000đ`. Keep the `stats.xp >= 5000` condition and its congratulatory message from PR #151 unchanged. Do not change XP calculations, layout, data fetching or reward logic.

Validation: GitNexus upstream impact before editing `DashboardPage`; review the exact copy and boundary cases 4999/5000/5001; run existing tests, TypeScript and production build; inspect the final diff and GitNexus detect_changes. No new tests are needed for this text-only replacement.
