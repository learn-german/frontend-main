# M4A uploads

The ticket screenshot reports audio/x-m4a rejected by Storage. The bucket accepts audio/mp4 but not audio/x-m4a. Add only the detected MIME alias to speaking-recordings; retain privacy, size cap, format checks, and RLS. SQL evaluation confirmed the existing upload policy already accepts valid M4A keys, so do not change it. Exercise submission/ownership/attempt-limit tests with M4A fixtures.
