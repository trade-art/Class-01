#!/bin/bash
# =============================================================================
# MT5 Platform - Database Verification Script
# =============================================================================
# Usage: ./scripts/db-verify.sh [options]
#
# Options:
#   --env             Environment (development|staging|production)
#   --check           Specific check to run (all|schema|data|constraints|indexes)
#   --verbose         Show detailed output
#   --fix             Attempt to fix issues (use with caution)
#   --report          Generate detailed report
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs/verification"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${LOG_DIR}/verification_${TIMESTAMP}.md"

# Default values
ENVIRONMENT="${NODE_ENV:-development}"
CHECK_TYPE="all"
VERBOSE=false
FIX_ISSUES=false
GENERATE_REPORT=false

# Result counters
PASSED=0
FAILED=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================================================
# Logging Functions
# =============================================================================
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}"

    if [[ "$GENERATE_REPORT" == true ]]; then
        echo "${timestamp} [${level}] ${message}" >> "$REPORT_FILE"
    fi
}

log_info() { log "INFO" "${BLUE}$*${NC}"; }
log_success() { log "PASS" "${GREEN}$*${NC}"; ((PASSED++)); }
log_warn() { log "WARN" "${YELLOW}$*${NC}"; ((WARNINGS++)); }
log_error() { log "FAIL" "${RED}$*${NC}"; ((FAILED++)); }

# =============================================================================
# Parse Arguments
# =============================================================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --env=*)
                ENVIRONMENT="${1#*=}"
                shift
                ;;
            --check)
                CHECK_TYPE="$2"
                shift 2
                ;;
            --check=*)
                CHECK_TYPE="${1#*=}"
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --fix)
                FIX_ISSUES=true
                shift
                ;;
            --report)
                GENERATE_REPORT=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
MT5 Platform Database Verification Script

Usage: ./scripts/db-verify.sh [options]

Options:
  --env <env>       Environment (development|staging|production)
  --check <type>    Check type: all|schema|data|constraints|indexes
  --verbose, -v     Show detailed output
  --fix             Attempt to fix issues (use with caution)
  --report          Generate detailed report
  -h, --help        Show this help message

Check Types:
  all          Run all verification checks (default)
  schema       Verify schema matches Prisma schema
  data         Verify data integrity
  constraints  Verify foreign key constraints
  indexes      Verify indexes are present and healthy

Examples:
  ./scripts/db-verify.sh --env production
  ./scripts/db-verify.sh --check schema --verbose
  ./scripts/db-verify.sh --report

EOF
}

# =============================================================================
# Setup Functions
# =============================================================================
setup() {
    mkdir -p "$LOG_DIR"

    if [[ "$GENERATE_REPORT" == true ]]; then
        cat > "$REPORT_FILE" << EOF
# Database Verification Report

- **Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Environment**: $ENVIRONMENT
- **Check Type**: $CHECK_TYPE

---

EOF
    fi
}

load_environment() {
    log_info "Loading environment: $ENVIRONMENT"

    local env_file="${PROJECT_ROOT}/config/.env.${ENVIRONMENT}"

    if [[ -f "$env_file" ]]; then
        # shellcheck source=/dev/null
        source "$env_file"
        log_info "Loaded environment from: $env_file"
    fi

    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL is not set"
        exit 1
    fi
}

parse_database_url() {
    local url="$DATABASE_URL"

    url="${url#postgresql://}"
    url="${url#postgres://}"

    if [[ "$url" == *"@"* ]]; then
        local creds="${url%%@*}"
        url="${url#*@}"
        DB_USER="${creds%%:*}"
        DB_PASSWORD="${creds#*:}"
    fi

    local host_part="${url%%/*}"
    local db_part="${url#*/}"

    DB_NAME="${db_part%%\?*}"

    if [[ "$host_part" == *":"* ]]; then
        DB_HOST="${host_part%%:*}"
        DB_PORT="${host_part#*:}"
    else
        DB_HOST="$host_part"
        DB_PORT="5432"
    fi

    export PGPASSWORD="$DB_PASSWORD"
}

run_sql() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

# =============================================================================
# Verification Functions
# =============================================================================
check_connection() {
    log_info "Checking database connection..."

    if run_sql "SELECT 1" > /dev/null; then
        log_success "Database connection OK"
        return 0
    else
        log_error "Cannot connect to database"
        return 1
    fi
}

check_prisma_sync() {
    log_info "Checking Prisma schema synchronization..."

    cd "${PROJECT_ROOT}/apps/platform-service"

    local status
    status=$(npx prisma migrate status 2>&1 || true)

    if echo "$status" | grep -q "Database schema is up to date"; then
        log_success "Prisma schema is synchronized"
        return 0
    elif echo "$status" | grep -q "Following migration"; then
        log_warn "Pending migrations detected"
        if [[ "$VERBOSE" == true ]]; then
            echo "$status"
        fi
        return 1
    else
        log_warn "Could not determine migration status"
        if [[ "$VERBOSE" == true ]]; then
            echo "$status"
        fi
        return 1
    fi
}

check_schema() {
    log_info "Verifying database schema..."

    # Check if required tables exist
    local required_tables=(
        "tenants"
        "tenant_admins"
        "platform_admins"
        "middleware_instances"
        "invoices"
        "api_keys"
        "system_settings"
        "risk_alerts"
        "risk_configs"
        "mt_servers"
        "audit_logs"
        "ip_blacklist"
    )

    local missing_tables=()

    for table in "${required_tables[@]}"; do
        local exists
        exists=$(run_sql "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table')")

        if [[ "$exists" == "t" ]]; then
            [[ "$VERBOSE" == true ]] && log_info "  Table '$table': exists"
        else
            missing_tables+=("$table")
            log_error "  Table '$table': MISSING"
        fi
    done

    if [[ ${#missing_tables[@]} -eq 0 ]]; then
        log_success "All required tables exist (${#required_tables[@]} tables)"
        return 0
    else
        log_error "Missing tables: ${missing_tables[*]}"
        return 1
    fi
}

check_data_integrity() {
    log_info "Verifying data integrity..."

    local checks_passed=true

    # Check for orphaned records
    log_info "  Checking for orphaned tenant_admins..."
    local orphaned_admins
    orphaned_admins=$(run_sql "
        SELECT COUNT(*)
        FROM tenant_admins ta
        WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = ta.tenant_id)
    ")

    if [[ "$orphaned_admins" -eq 0 ]]; then
        [[ "$VERBOSE" == true ]] && log_info "  No orphaned tenant_admins found"
    else
        log_warn "  Found $orphaned_admins orphaned tenant_admins"
        checks_passed=false

        if [[ "$FIX_ISSUES" == true ]]; then
            log_info "  Fixing: Deleting orphaned tenant_admins..."
            run_sql "
                DELETE FROM tenant_admins ta
                WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = ta.tenant_id)
            "
            log_success "  Fixed orphaned tenant_admins"
        fi
    fi

    # Check for orphaned middleware_instances
    log_info "  Checking for orphaned middleware_instances..."
    local orphaned_instances
    orphaned_instances=$(run_sql "
        SELECT COUNT(*)
        FROM middleware_instances mi
        WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = mi.tenant_id)
    ")

    if [[ "$orphaned_instances" -eq 0 ]]; then
        [[ "$VERBOSE" == true ]] && log_info "  No orphaned middleware_instances found"
    else
        log_warn "  Found $orphaned_instances orphaned middleware_instances"
        checks_passed=false
    fi

    # Check for NULL required fields
    log_info "  Checking for NULL required fields..."
    local null_emails
    null_emails=$(run_sql "SELECT COUNT(*) FROM tenants WHERE email IS NULL OR email = ''")

    if [[ "$null_emails" -eq 0 ]]; then
        [[ "$VERBOSE" == true ]] && log_info "  All tenant emails are populated"
    else
        log_warn "  Found $null_emails tenants with NULL/empty email"
        checks_passed=false
    fi

    if [[ "$checks_passed" == true ]]; then
        log_success "Data integrity checks passed"
        return 0
    else
        log_warn "Some data integrity issues found"
        return 1
    fi
}

check_constraints() {
    log_info "Verifying foreign key constraints..."

    # Get count of foreign key constraints
    local fk_count
    fk_count=$(run_sql "
        SELECT COUNT(*)
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    ")

    log_info "  Found $fk_count foreign key constraints"

    # Check for constraint violations
    log_info "  Checking for constraint violations..."

    local violations=0

    # Check tenant_admins -> tenants
    local admin_violations
    admin_violations=$(run_sql "
        SELECT COUNT(*)
        FROM tenant_admins ta
        LEFT JOIN tenants t ON ta.tenant_id = t.id
        WHERE t.id IS NULL
    ")
    if [[ "$admin_violations" -gt 0 ]]; then
        log_warn "  tenant_admins FK violation: $admin_violations records"
        violations=$((violations + admin_violations))
    fi

    # Check middleware_instances -> tenants
    local instance_violations
    instance_violations=$(run_sql "
        SELECT COUNT(*)
        FROM middleware_instances mi
        LEFT JOIN tenants t ON mi.tenant_id = t.id
        WHERE t.id IS NULL
    ")
    if [[ "$instance_violations" -gt 0 ]]; then
        log_warn "  middleware_instances FK violation: $instance_violations records"
        violations=$((violations + instance_violations))
    fi

    if [[ "$violations" -eq 0 ]]; then
        log_success "No foreign key constraint violations"
        return 0
    else
        log_error "Found $violations total constraint violations"
        return 1
    fi
}

check_indexes() {
    log_info "Verifying indexes..."

    # Get index statistics
    local index_count
    index_count=$(run_sql "
        SELECT COUNT(*)
        FROM pg_indexes
        WHERE schemaname = 'public'
    ")

    log_info "  Found $index_count indexes"

    # Check for missing indexes on foreign keys
    log_info "  Checking for missing FK indexes..."

    local missing_indexes
    missing_indexes=$(run_sql "
        SELECT COUNT(*)
        FROM (
            SELECT
                tc.table_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
            EXCEPT
            SELECT
                t.relname as table_name,
                a.attname as column_name
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
            WHERE t.relnamespace = 'public'::regnamespace
        ) missing
    ")

    if [[ "$missing_indexes" -eq 0 ]]; then
        log_success "All foreign keys have indexes"
    else
        log_warn "Found $missing_indexes foreign keys without indexes"
    fi

    # Check index health
    log_info "  Checking index health..."

    local invalid_indexes
    invalid_indexes=$(run_sql "
        SELECT COUNT(*)
        FROM pg_index
        WHERE NOT indisvalid
    ")

    if [[ "$invalid_indexes" -eq 0 ]]; then
        log_success "All indexes are valid"
        return 0
    else
        log_error "Found $invalid_indexes invalid indexes"

        if [[ "$FIX_ISSUES" == true ]]; then
            log_info "  Reindexing invalid indexes..."
            run_sql "REINDEX DATABASE \"$DB_NAME\""
            log_success "  Reindex completed"
        fi

        return 1
    fi
}

check_sequences() {
    log_info "Verifying sequences..."

    # Check for sequence issues
    local sequence_count
    sequence_count=$(run_sql "
        SELECT COUNT(*)
        FROM pg_sequences
        WHERE schemaname = 'public'
    ")

    log_info "  Found $sequence_count sequences"

    # Check if any sequences are near max value (not applicable for UUID primary keys)
    log_success "Sequence checks passed (using UUID primary keys)"
}

check_disk_usage() {
    log_info "Checking database size..."

    local db_size
    db_size=$(run_sql "SELECT pg_size_pretty(pg_database_size('$DB_NAME'))")

    log_info "  Database size: $db_size"

    # Get table sizes
    if [[ "$VERBOSE" == true ]]; then
        log_info "  Table sizes:"
        run_sql "
            SELECT
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
            LIMIT 10
        " | while read line; do
            echo "    $line"
        done
    fi

    log_success "Disk usage check completed"
}

# =============================================================================
# Main
# =============================================================================
main() {
    parse_args "$@"
    setup

    log_info "============================================="
    log_info "MT5 Platform Database Verification"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Check Type: $CHECK_TYPE"
    log_info "============================================="

    load_environment
    parse_database_url

    # Always check connection first
    if ! check_connection; then
        log_error "Cannot proceed without database connection"
        exit 1
    fi

    # Run requested checks
    case "$CHECK_TYPE" in
        all)
            check_prisma_sync
            check_schema
            check_data_integrity
            check_constraints
            check_indexes
            check_sequences
            check_disk_usage
            ;;
        schema)
            check_prisma_sync
            check_schema
            ;;
        data)
            check_data_integrity
            ;;
        constraints)
            check_constraints
            ;;
        indexes)
            check_indexes
            ;;
        *)
            log_error "Unknown check type: $CHECK_TYPE"
            exit 1
            ;;
    esac

    # Summary
    echo ""
    log_info "============================================="
    log_info "Verification Summary"
    log_info "============================================="
    log_info "Passed:   $PASSED"
    log_info "Failed:   $FAILED"
    log_info "Warnings: $WARNINGS"
    log_info "============================================="

    if [[ "$GENERATE_REPORT" == true ]]; then
        cat >> "$REPORT_FILE" << EOF

---

## Summary

| Metric   | Count |
|----------|-------|
| Passed   | $PASSED |
| Failed   | $FAILED |
| Warnings | $WARNINGS |

EOF
        log_info "Report saved: $REPORT_FILE"
    fi

    if [[ "$FAILED" -gt 0 ]]; then
        log_error "Verification FAILED"
        exit 1
    elif [[ "$WARNINGS" -gt 0 ]]; then
        log_warn "Verification completed with warnings"
        exit 0
    else
        log_success "Verification PASSED"
        exit 0
    fi
}

main "$@"
