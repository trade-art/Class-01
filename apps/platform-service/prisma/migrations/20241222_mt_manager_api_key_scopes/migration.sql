-- AddColumn: api_key_scopes to mt_managers
-- Permission scopes support for MtManager API Key authentication

ALTER TABLE "mt_managers" ADD COLUMN "api_key_scopes" TEXT[] DEFAULT ARRAY['*']::TEXT[];
