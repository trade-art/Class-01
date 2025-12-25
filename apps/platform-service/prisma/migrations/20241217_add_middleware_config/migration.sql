-- Add middleware configuration features

-- Enable pgcrypto extension for random bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add registration_secret columns to middlewares table
ALTER TABLE "platform"."middlewares"
  ADD COLUMN IF NOT EXISTS "registration_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "registration_secret_hash" TEXT;

-- Step 2: Generate registration secrets for existing middlewares
-- Use gen_random_uuid() for secret and digest() with pgcrypto for hash
UPDATE "platform"."middlewares"
SET
  "registration_secret" = 'reg_' || replace(gen_random_uuid()::text, '-', ''),
  "registration_secret_hash" = encode(digest('reg_' || replace(gen_random_uuid()::text, '-', ''), 'sha256'), 'hex')
WHERE "registration_secret" IS NULL;

-- Step 3: Make registration_secret columns NOT NULL and UNIQUE
ALTER TABLE "platform"."middlewares"
  ALTER COLUMN "registration_secret" SET NOT NULL,
  ALTER COLUMN "registration_secret_hash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "middlewares_registration_secret_key"
  ON "platform"."middlewares"("registration_secret");

-- Step 4: Make api_key and api_key_hash nullable (middleware gets them after registration)
ALTER TABLE "platform"."middlewares"
  ALTER COLUMN "api_key" DROP NOT NULL,
  ALTER COLUMN "api_key_hash" DROP NOT NULL;

-- Step 5: Create middleware_configs table
CREATE TABLE IF NOT EXISTS "platform"."middleware_configs" (
    "id" TEXT NOT NULL,
    "middleware_id" TEXT NOT NULL,

    -- Rate Limit Configuration
    "rate_limit_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_requests_per_min" INTEGER NOT NULL DEFAULT 60,
    "rate_limit_burst_size" INTEGER NOT NULL DEFAULT 100,

    -- Circuit Breaker Configuration
    "circuit_breaker_enabled" BOOLEAN NOT NULL DEFAULT true,
    "circuit_breaker_failure_threshold" INTEGER NOT NULL DEFAULT 5,
    "circuit_breaker_open_timeout_sec" INTEGER NOT NULL DEFAULT 30,
    "circuit_breaker_half_open_requests" INTEGER NOT NULL DEFAULT 3,

    -- Retry Configuration
    "retry_enabled" BOOLEAN NOT NULL DEFAULT true,
    "retry_max_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_base_delay_ms" INTEGER NOT NULL DEFAULT 1000,
    "retry_max_delay_ms" INTEGER NOT NULL DEFAULT 10000,

    -- Cache TTL Configuration (seconds)
    "cache_user_ttl" INTEGER NOT NULL DEFAULT 300,
    "cache_quote_ttl" INTEGER NOT NULL DEFAULT 1,
    "cache_balance_ttl" INTEGER NOT NULL DEFAULT 5,
    "cache_symbol_ttl" INTEGER NOT NULL DEFAULT 86400,
    "cache_bars_ttl" INTEGER NOT NULL DEFAULT 60,

    -- WebSocket Configuration
    "ws_heartbeat_interval_sec" INTEGER NOT NULL DEFAULT 30,
    "ws_ping_timeout_sec" INTEGER NOT NULL DEFAULT 10,
    "ws_max_connections" INTEGER NOT NULL DEFAULT 10000,

    -- CORS Configuration
    "cors_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cors_allowed_origins" TEXT NOT NULL DEFAULT '*',
    "cors_allowed_methods" TEXT NOT NULL DEFAULT 'GET,POST,PUT,DELETE,OPTIONS',

    -- Security Configuration
    "security_max_login_attempts" INTEGER NOT NULL DEFAULT 5,
    "security_lockout_duration_min" INTEGER NOT NULL DEFAULT 30,
    "security_session_timeout_min" INTEGER NOT NULL DEFAULT 30,

    -- Request Queue Configuration
    "request_queue_enabled" BOOLEAN NOT NULL DEFAULT true,
    "request_queue_max_size" INTEGER NOT NULL DEFAULT 1000,
    "request_queue_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "request_queue_worker_count" INTEGER NOT NULL DEFAULT 4,

    -- Batch Concurrency
    "batch_concurrency_limit" INTEGER NOT NULL DEFAULT 10,

    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "middleware_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "middleware_configs_middleware_id_key" UNIQUE ("middleware_id"),
    CONSTRAINT "middleware_configs_middleware_id_fkey" FOREIGN KEY ("middleware_id")
      REFERENCES "platform"."middlewares"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 6: Create default config for existing middlewares
INSERT INTO "platform"."middleware_configs" ("id", "middleware_id")
SELECT gen_random_uuid()::text, "id"
FROM "platform"."middlewares"
WHERE NOT EXISTS (
  SELECT 1 FROM "platform"."middleware_configs" WHERE "middleware_id" = "middlewares"."id"
);
