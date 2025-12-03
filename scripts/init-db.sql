-- MT5 Platform Database Initialization Script
-- This script runs when PostgreSQL container starts for the first time

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS audit;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA platform TO mt5admin;
GRANT ALL PRIVILEGES ON SCHEMA audit TO mt5admin;

-- Set search path
ALTER DATABASE mt5_platform SET search_path TO platform, public;

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit.operation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_type VARCHAR(20),
    tenant_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit.operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit.operation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit.operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit.operation_logs(action);

-- Output success message
DO $$
BEGIN
    RAISE NOTICE 'MT5 Platform database initialized successfully!';
END
$$;
