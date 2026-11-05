# Admin learning pace implementation

1. Backend: migration sửa practice_can_read_set cho trusted service_role; SQL rollback tests bảo toàn learner publication. daily-progress-report/index.ts đọc paged grammar/reading flags, fail on query errors, giữ admin-only POST; Node handler tests về authorization và missing/reading data.
2. Frontend: src/lib/adminLearningPace.ts presenter + tests; AdminLearningPace component fetch POST bằng user_id, loading/error/empty và cancellation; nhúng vào modal AdminUsersSection. Không thay đổi phần điểm hoặc các nút sửa user.
3. Verify SQL + Edge tests, frontend tests/TypeScript/build, impact/detect_changes. Review độc lập toàn patch; apply migration/deploy function qua Supabase connector; create/attach một PR, wait checks/merge, hậu kiểm UI và Notion review.
