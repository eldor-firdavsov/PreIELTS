-- 0013_drop_service_secrets
--
-- Removes the secrets table 0012 originally created as a fallback for Edge
-- Functions that could not read a platform secret. The evaluator reads
-- GEMINI_API_KEY from the function environment instead, which is where a
-- credential belongs. Dead schema that once held a secret is worse than none,
-- so it goes rather than lingering empty.
drop table if exists service_secrets;
