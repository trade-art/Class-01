-- API Key Extensions Migration (middleware-auth-refactor Task 21-22)
-- This migration adds enhanced fields to the api_keys table for the new authentication architecture

-- Step 1: Rename old columns to new names
ALTER TABLE "api_keys" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "api_keys" RENAME COLUMN "hashedKey" TO "hashed_key";

-- Step 2: Remove old key column (was storing plain text key, now we only store prefix and hash)
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "key";

-- Step 3: Add new columns
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_prefix" VARCHAR(8);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY['*'];
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "server_id" VARCHAR(255);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rate_limit" INTEGER DEFAULT 1000;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "usage_count" INTEGER DEFAULT 0;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_ip" VARCHAR(45);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT true;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "revoked_by" VARCHAR(255);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "created_by" VARCHAR(255);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Step 4: Rename old columns if they exist with different names
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'isActive') THEN
        UPDATE "api_keys" SET "is_active" = "isActive";
        ALTER TABLE "api_keys" DROP COLUMN "isActive";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'lastUsedAt') THEN
        UPDATE "api_keys" SET "last_used_at" = "lastUsedAt";
        ALTER TABLE "api_keys" DROP COLUMN "lastUsedAt";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'expiresAt') THEN
        UPDATE "api_keys" SET "expires_at" = "expiresAt";
        ALTER TABLE "api_keys" DROP COLUMN "expiresAt";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'createdAt') THEN
        UPDATE "api_keys" SET "created_at" = "createdAt";
        ALTER TABLE "api_keys" DROP COLUMN "createdAt";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'updatedAt') THEN
        UPDATE "api_keys" SET "updated_at" = "updatedAt";
        ALTER TABLE "api_keys" DROP COLUMN "updatedAt";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'rateLimit') THEN
        UPDATE "api_keys" SET "rate_limit" = "rateLimit";
        ALTER TABLE "api_keys" DROP COLUMN "rateLimit";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'permissions') THEN
        ALTER TABLE "api_keys" DROP COLUMN "permissions";
    END IF;
END $$;

-- Step 5: Generate key_prefix from existing hashed_key (first 8 chars)
UPDATE "api_keys" SET "key_prefix" = LEFT("hashed_key", 8) WHERE "key_prefix" IS NULL;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS "api_keys_tenant_id_idx" ON "api_keys" ("tenant_id");
CREATE INDEX IF NOT EXISTS "api_keys_hashed_key_idx" ON "api_keys" ("hashed_key");
CREATE INDEX IF NOT EXISTS "api_keys_key_prefix_idx" ON "api_keys" ("key_prefix");

-- Step 7: Add NOT NULL constraint to key_prefix after data migration
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;
