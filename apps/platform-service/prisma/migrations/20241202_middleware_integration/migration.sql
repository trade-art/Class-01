-- middleware-integration Task 5: Add new fields and tables

-- Add new enums
CREATE TYPE "CircuitBreakerState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- Alter InstanceStatus enum to add DEGRADED
ALTER TYPE "InstanceStatus" ADD VALUE IF NOT EXISTS 'DEGRADED';

-- Add new columns to middleware_instances table
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "last_checked_at" TIMESTAMP(3);
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "useTls" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "instance_identifier" TEXT;
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "webhook_secret" TEXT;
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "latency_ms" INTEGER;
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "circuit_breaker_state" "CircuitBreakerState" NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "middleware_instances" ADD COLUMN IF NOT EXISTS "consecutive_failures" INTEGER NOT NULL DEFAULT 0;

-- Add new columns to tenants table for white-label branding
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT;

-- CreateTable instance_events
CREATE TABLE IF NOT EXISTS "instance_events" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'platform',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instance_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for instance_events
CREATE INDEX IF NOT EXISTS "instance_events_instance_id_created_at_idx" ON "instance_events"("instance_id", "created_at");
CREATE INDEX IF NOT EXISTS "instance_events_event_type_created_at_idx" ON "instance_events"("event_type", "created_at");

-- AddForeignKey for instance_events
ALTER TABLE "instance_events" ADD CONSTRAINT "instance_events_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "middleware_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
