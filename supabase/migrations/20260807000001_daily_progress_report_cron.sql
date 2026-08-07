-- =============================================================================
-- DeutschPath — Daily Progress Report: scheduled job pre-warm báo cáo cho
-- user không mở Dashboard trong ngày (GET của edge function đã tự cập nhật
-- report tươi mỗi khi user mở Dashboard — cron này chỉ đảm bảo vẫn có
-- snapshot lịch sử cho user không ghé qua hôm đó).
--
-- QUAN TRỌNG: cron gọi edge function bằng Bearer token lấy từ Vault secret
-- tên "service_role_key" — secret này KHÔNG được tạo bởi migration này
-- (không được phép biết/hardcode giá trị SUPABASE_SERVICE_ROLE_KEY thật vào
-- bất kỳ file nào commit lên git). Người vận hành cần tự chạy 1 lần trong
-- SQL Editor của Supabase dashboard (không qua migration):
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY thật>', 'service_role_key');
-- Nếu secret chưa tồn tại, cron job vẫn tạo được nhưng lần chạy sẽ lỗi
-- 401/Unauthorized ở phía edge function — không phá gì khác, chỉ cần tạo
-- secret rồi job sẽ tự chạy đúng ở lần kế tiếp.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'daily-progress-report-batch',
  '5 17 * * *', -- 00:05 giờ Việt Nam (ICT = UTC+7)
  $$
  SELECT net.http_post(
    url := 'https://awdhqlgxnjwymwgxltlw.supabase.co/functions/v1/daily-progress-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'batch')
  );
  $$
);
