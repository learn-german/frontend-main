-- Storage detects some M4A recordings as audio/x-m4a despite audio/mp4 upload headers.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/x-m4a')
WHERE id = 'speaking-recordings'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/x-m4a' = ANY(allowed_mime_types));
