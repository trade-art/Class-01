#!/bin/bash
# =============================================================================
# MT5 Platform - Database Migration Script
# =============================================================================
# Usage: ./scripts/db-migrate.sh [options]
#
# Options:
#   --env           Environment (development|staging|production)
#   --skip-backup   Skip pre-migration backup (not recommended for production)
#   --skip-verify   Skip post-migration verification
#   --dry-run       Show what would be migrated without executing
#   --force         Force migration even with pending warnings
#   --rollback      Rollback the last migration
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs/migrations"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/migration_${TIMESTAMP}.log"

# Default values
ENVIRONMENT="${NODE_ENV:-development}"
SKIP_BACKUP=false
SKIP_VERIFY=false
DRY_RUN=false
FORCE=false
ROLLBACK=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Logging Functions
# =============================================================================
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "${BLUE}$*${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$*${NC}"; }
log_warn() { log "WARN" "${YELLOW}$*${NC}"; }
log_error() { log "ERROR" "${RED}$*${NC}"; }

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
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-verify)
                SKIP_VERIFY=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --rollback)
                ROLLBACK=true
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
MT5 Platform Database Migration Script

Usage: ./scripts/db-migrate.sh [options]

Options:
  --env <env>      Environment (development|staging|production) [default: development]
  --skip-backup    Skip pre-migration backup (not recommended for production)
  --skip-verify    Skip post-migration verification
  --dry-run        Show what would be migrated without executing
  --force          Force migration even with pending warnings
  --rollback       Rollback the last migration
  -h, --help       Show this help message

Examples:
  ./scripts/db-migrate.sh --env production
  ./scripts/db-migrate.sh --env staging --skip-backup
  ./scripts/db-migrate.sh --dry-run
  ./scripts/db-migrate.sh --rollback

EOF
}

# =============================================================================
# Setup Functions
# =============================================================================
setup_logging() {
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"
    log_info "Migration log: $LOG_FILE"
}

load_environment() {
    log_info "Loading environment: $ENVIRONMENT"

    local env_file="${PROJECT_ROOT}/config/.env.${ENVIRONMENT}"

    if [[ -f "$env_file" ]]; then
        # shellcheck source=/dev/null
        source "$env_file"
        log_info "Loaded environment from: $env_file"
    else
        log_warn "Environment file not found: $env_file"
    fi

    # Validate required variables
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL is not set"
        exit 1
    fi

    # Mask password in log
    local masked_url=$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:****@/')
    log_info "Database URL: $masked_url"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if npx is available
    if ! command -v npx &> /dev/null; then
        log_error "npx is not installed. Please install Node.js and npm."
        exit 1
    fi

    # Check if Prisma is available
    if ! npx prisma --version &> /dev/null; then
        log_error "Prisma is not installed. Running npm install..."
        cd "${PROJECT_ROOT}/apps/platform-service"
        npm install
    fi

    # Check database connectivity
    log_info "Testing database connection..."
    cd "${PROJECT_ROOT}/apps/platform-service"

    if ! npx prisma db execute --stdin <<< "SELECT 1" 2>/dev/null; then
        log_error "Cannot connect to database. Please check DATABASE_URL."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# =============================================================================
# Migration Functions
# =============================================================================
get_pending_migrations() {
    cd "${PROJECT_ROOT}/apps/platform-service"
    npx prisma migrate status 2>&1 || true
}

check_pending_migrations() {
    log_info "Checking pending migrations..."

    local status
    status=$(get_pending_migrations)

    echo "$status" >> "$LOG_FILE"

    if echo "$status" | grep -q "Database schema is up to date"; then
        log_success "Database schema is up to date. No migrations needed."
        return 1
    fi

    if echo "$status" | grep -q "Following migration"; then
        log_info "Found pending migrations:"
        echo "$status" | grep -E "^\s+[0-9]+" || true
        return 0
    fi

    return 0
}

run_backup() {
    if [[ "$SKIP_BACKUP" == true ]]; then
        log_warn "Skipping pre-migration backup (--skip-backup flag)"
        return 0
    fi

    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Running pre-migration backup (production environment)..."

        if [[ -x "${SCRIPT_DIR}/db-backup.sh" ]]; then
            if ! "${SCRIPT_DIR}/db-backup.sh" --pre-migration; then
                log_error "Backup failed. Aborting migration."
                exit 1
            fi
            log_success "Backup completed successfully"
        else
            log_warn "Backup script not found or not executable"
            if [[ "$FORCE" != true ]]; then
                log_error "Use --force to proceed without backup or create backup script"
                exit 1
            fi
        fi
    else
        log_info "Skipping backup for non-production environment"
    fi
}

run_migration() {
    log_info "Starting database migration..."

    cd "${PROJECT_ROOT}/apps/platform-service"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would execute the following migrations:"
        npx prisma migrate status
        return 0
    fi

    if [[ "$ROLLBACK" == true ]]; then
        log_warn "Rolling back last migration..."

        # Prisma doesn't have a direct rollback command
        # We need to use prisma migrate resolve or reset
        log_error "Prisma doesn't support direct rollback. Options:"
        echo "  1. Restore from backup"
        echo "  2. Run: npx prisma migrate resolve --rolled-back <migration-name>"
        echo "  3. Run: npx prisma db push --force-reset (DESTRUCTIVE)"
        exit 1
    fi

    # Run the migration
    local migrate_cmd="npx prisma migrate deploy"

    log_info "Executing: $migrate_cmd"

    if eval "$migrate_cmd" 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Migration completed successfully"
        return 0
    else
        log_error "Migration failed"
        return 1
    fi
}

run_verification() {
    if [[ "$SKIP_VERIFY" == true ]]; then
        log_warn "Skipping post-migration verification (--skip-verify flag)"
        return 0
    fi

    log_info "Running post-migration verification..."

    if [[ -x "${SCRIPT_DIR}/db-verify.sh" ]]; then
        if ! "${SCRIPT_DIR}/db-verify.sh"; then
            log_error "Verification failed"
            return 1
        fi
        log_success "Verification passed"
    else
        log_warn "Verification script not found, running basic checks..."

        cd "${PROJECT_ROOT}/apps/platform-service"

        # Check migration status
        if npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
            log_success "Basic verification passed: Schema is up to date"
        else
            log_warn "Schema may have pending migrations"
        fi

        # Generate Prisma client
        log_info "Regenerating Prisma client..."
        npx prisma generate
        log_success "Prisma client regenerated"
    fi
}

generate_report() {
    log_info "Generating migration report..."

    local report_file="${LOG_DIR}/migration_report_${TIMESTAMP}.md"

    cat > "$report_file" << EOF
# Database Migration Report

- **Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Environment**: $ENVIRONMENT
- **Status**: $([ $? -eq 0 ] && echo "SUCCESS" || echo "FAILED")

## Configuration
- Skip Backup: $SKIP_BACKUP
- Skip Verify: $SKIP_VERIFY
- Dry Run: $DRY_RUN
- Force: $FORCE

## Migration Status

\`\`\`
$(get_pending_migrations)
\`\`\`

## Log File
- Path: $LOG_FILE

EOF

    log_info "Report saved to: $report_file"
}

# =============================================================================
# Main
# =============================================================================
main() {
    parse_args "$@"
    setup_logging

    log_info "============================================="
    log_info "MT5 Platform Database Migration"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $TIMESTAMP"
    log_info "============================================="

    load_environment
    check_prerequisites

    # Check if there are pending migrations
    if ! check_pending_migrations; then
        if [[ "$FORCE" != true ]]; then
            log_info "No pending migrations. Use --force to run anyway."
            exit 0
        fi
    fi

    # Run backup for production
    run_backup

    # Execute migration
    if ! run_migration; then
        log_error "Migration failed. Check logs at: $LOG_FILE"

        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Consider restoring from backup if needed"
        fi

        exit 1
    fi

    # Verify migration
    run_verification

    # Generate report
    generate_report

    log_info "============================================="
    log_success "Migration completed successfully!"
    log_info "============================================="
}

main "$@"
