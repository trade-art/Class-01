-- MT Manager Split Migration
-- Separates manager credentials from MT Server into a dedicated MtManager table
-- This enables one-to-many relationship: one server can have multiple manager accounts

-- Step 1: Create the new mt_managers table
CREATE TABLE "mt_managers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "mt_server_id" TEXT NOT NULL,
    "manager_login" BIGINT NOT NULL,
    "manager_password_encrypted" TEXT NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mt_managers_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing manager data from mt_servers to mt_managers
-- Only migrate if there's valid manager data
INSERT INTO "mt_managers" (
    "id",
    "tenant_id",
    "mt_server_id",
    "manager_login",
    "manager_password_encrypted",
    "display_name",
    "is_active",
    "is_default",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    "tenant_id",
    "id",
    "manager_login",
    "manager_password_encrypted",
    CONCAT('Manager ', "manager_login"),
    "is_active",
    true,  -- Mark as default since it's the only manager
    "created_at",
    "updated_at"
FROM "mt_servers"
WHERE "manager_login" IS NOT NULL
  AND "manager_password_encrypted" IS NOT NULL
  AND "manager_password_encrypted" != '';

-- Step 3: Create indexes for mt_managers
CREATE INDEX "mt_managers_tenant_id_idx" ON "mt_managers"("tenant_id");
CREATE INDEX "mt_managers_mt_server_id_is_active_idx" ON "mt_managers"("mt_server_id", "is_active");

-- Step 4: Create unique constraint for mt_managers
CREATE UNIQUE INDEX "mt_managers_mt_server_id_manager_login_key" ON "mt_managers"("mt_server_id", "manager_login");

-- Step 5: Add foreign key constraint
ALTER TABLE "mt_managers" ADD CONSTRAINT "mt_managers_mt_server_id_fkey"
    FOREIGN KEY ("mt_server_id") REFERENCES "mt_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Remove manager columns from mt_servers
-- First, we need to handle existing data
ALTER TABLE "mt_servers" DROP COLUMN IF EXISTS "manager_login";
ALTER TABLE "mt_servers" DROP COLUMN IF EXISTS "manager_password_encrypted";
