-- MT Manager API Key Migration
-- Adds external API Key fields to mt_managers table for third-party application authentication

-- Step 1: Add API Key columns to mt_managers table
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_id" VARCHAR(32) UNIQUE;
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_secret_hash" VARCHAR(255);
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_created_at" TIMESTAMP;
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_last_used_at" TIMESTAMP;
ALTER TABLE "mt_managers" ADD COLUMN IF NOT EXISTS "api_key_last_used_ip" VARCHAR(45);

-- Step 2: Create index for fast API Key lookup
CREATE INDEX IF NOT EXISTS "mt_managers_api_key_id_idx" ON "mt_managers" ("api_key_id");

-- Step 3: Add comment for documentation
COMMENT ON COLUMN "mt_managers"."api_key_id" IS 'Public API Key identifier (e.g., mk_xxxx)';
COMMENT ON COLUMN "mt_managers"."api_key_secret_hash" IS 'Hashed API Secret (bcrypt), only shown once when created';
COMMENT ON COLUMN "mt_managers"."api_key_enabled" IS 'Whether this API Key is enabled for external access';
COMMENT ON COLUMN "mt_managers"."api_key_created_at" IS 'When the API Key was created';
COMMENT ON COLUMN "mt_managers"."api_key_last_used_at" IS 'Last time the API Key was used (for auditing)';
COMMENT ON COLUMN "mt_managers"."api_key_last_used_ip" IS 'IP address from which API Key was last used';
