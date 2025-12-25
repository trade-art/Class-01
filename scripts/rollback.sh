#!/bin/bash
# =============================================================================
# MT5 Platform - Rollback Script
# =============================================================================
# Usage: ./scripts/rollback.sh [options]
#
# Options:
#   --env           Environment (development|staging|production)
#   --version       Specific version to rollback to
#   --list          List available versions for rollback
#   --force         Skip confirmation prompts
#   --dry-run       Show what would be rolled back without executing
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs/deployments"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/rollback_${TIMESTAMP}.log"

# Default values
ENVIRONMENT="development"
TARGET_VERSION=""
LIST_VERSIONS=false
FORCE=false
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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
log_step() { echo -e "\n${CYAN}==> $*${NC}" | tee -a "$LOG_FILE"; }

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
            --version)
                TARGET_VERSION="$2"
                shift 2
                ;;
            --version=*)
                TARGET_VERSION="${1#*=}"
                shift
                ;;
            --list)
                LIST_VERSIONS=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
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

    # Validate environment
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi
}

show_help() {
    cat << EOF
MT5 Platform Rollback Script

Usage: ./scripts/rollback.sh [options]

Options:
  --env <env>      Environment: development|staging|production (default: development)
  --version <ver>  Specific version to rollback to
  --list           List available versions for rollback
  --force          Skip confirmation prompts
  --dry-run        Show what would be rolled back without executing
  -h, --help       Show this help message

Examples:
  ./scripts/rollback.sh --env staging --list
  ./scripts/rollback.sh --env staging --version v1.0.0
  ./scripts/rollback.sh --env production --version v1.0.0 --force
  ./scripts/rollback.sh --dry-run

EOF
}

# =============================================================================
# Setup Functions
# =============================================================================
setup() {
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"

    log_info "============================================="
    log_info "MT5 Platform Rollback"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $TIMESTAMP"
    log_info "Log file: $LOG_FILE"
    log_info "============================================="
}

load_environment() {
    local env_file="${PROJECT_ROOT}/config/.env.${ENVIRONMENT}"

    if [[ -f "$env_file" ]]; then
        # shellcheck source=/dev/null
        source "$env_file"
        log_info "Loaded environment: $env_file"
    fi
}

# =============================================================================
# Version Discovery
# =============================================================================
get_current_version() {
    # Get current running version from container
    local current
    current=$(docker ps --format '{{.Image}}' 2>/dev/null | grep "tenant-api" | head -1 | cut -d: -f2 || echo "unknown")
    echo "$current"
}

get_available_versions() {
    log_step "Available versions for rollback"

    echo ""
    echo "Currently running:"
    docker ps --format "  {{.Names}}: {{.Image}}" 2>/dev/null | grep -E "(tenant-api|platform-service)" || echo "  No services running"

    echo ""
    echo "Available local images:"
    docker images --format "  {{.Repository}}:{{.Tag}} ({{.CreatedSince}})" 2>/dev/null | grep -E "(tenant-api|platform-service)" | head -20 || echo "  No images found"

    echo ""
    echo "Recent deployments (from logs):"
    if [[ -d "$LOG_DIR" ]]; then
        ls -t "$LOG_DIR"/deploy_*.log 2>/dev/null | head -5 | while read -r logfile; do
            local log_time=$(basename "$logfile" | sed 's/deploy_\([0-9]*_[0-9]*\).log/\1/')
            local version=$(grep -m1 "Version:" "$logfile" 2>/dev/null | awk '{print $NF}' || echo "unknown")
            echo "  $log_time: $version"
        done || echo "  No deployment logs found"
    fi

    echo ""
}

get_previous_version() {
    # Try to find previous version from images
    local versions
    versions=$(docker images --format "{{.Tag}}" 2>/dev/null | grep -E "^v[0-9]|^[0-9a-f]{7,}" | head -5)

    local current
    current=$(get_current_version)

    # Return the second version (first is current)
    echo "$versions" | grep -v "^$current$" | head -1
}

# =============================================================================
# Rollback Functions
# =============================================================================
validate_version() {
    local version="$1"

    log_info "Validating version: $version"

    # Check if images exist
    local tenant_api_exists=false
    local platform_service_exists=false

    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "tenant-api:$version"; then
        tenant_api_exists=true
        log_success "Found: tenant-api:$version"
    fi

    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "platform-service:$version"; then
        platform_service_exists=true
        log_success "Found: platform-service:$version"
    fi

    if [[ "$tenant_api_exists" != true || "$platform_service_exists" != true ]]; then
        log_error "Required images not found for version: $version"
        log_info "Run --list to see available versions"
        return 1
    fi

    return 0
}

create_pre_rollback_backup() {
    log_step "Creating pre-rollback backup"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would create database backup"
        return 0
    fi

    # Save current state
    local current_version
    current_version=$(get_current_version)

    log_info "Current version: $current_version"

    # Create database backup
    if [[ -x "${SCRIPT_DIR}/db-backup.sh" ]]; then
        "${SCRIPT_DIR}/db-backup.sh" --env "$ENVIRONMENT" --pre-migration || {
            log_warn "Database backup failed, continuing..."
        }
    fi

    # Save rollback info
    local rollback_info="${LOG_DIR}/rollback_info_${TIMESTAMP}.json"
    cat > "$rollback_info" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "previous_version": "$current_version",
    "target_version": "$TARGET_VERSION",
    "rollback_initiated_by": "${USER:-unknown}"
}
EOF

    log_info "Rollback info saved: $rollback_info"
}

execute_rollback() {
    log_step "Executing rollback to version: $TARGET_VERSION"

    cd "$PROJECT_ROOT"

    local compose_files="-f docker-compose.yml"
    if [[ "$ENVIRONMENT" != "development" ]]; then
        compose_files="$compose_files -f docker-compose.prod.yml"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would execute rollback commands:"
        log_info "  export APP_VERSION=$TARGET_VERSION"
        log_info "  docker compose $compose_files up -d tenant-api platform-service"
        return 0
    fi

    # Set version
    export APP_VERSION="$TARGET_VERSION"

    log_info "Stopping current services..."
    docker compose $compose_files stop tenant-api platform-service 2>&1 | tee -a "$LOG_FILE"

    log_info "Starting services with version: $TARGET_VERSION"
    docker compose $compose_files up -d tenant-api platform-service 2>&1 | tee -a "$LOG_FILE"

    log_info "Waiting for services to start..."
    sleep 10

    # Show status
    log_info "Service status:"
    docker compose $compose_files ps 2>&1 | tee -a "$LOG_FILE"
}

verify_rollback() {
    log_step "Verifying rollback"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would verify rollback health"
        return 0
    fi

    local verification_passed=true

    # Check tenant-api health
    log_info "Checking tenant-api health..."
    local tenant_api_url="http://localhost:${TENANT_API_PORT:-3000}/health"

    for i in {1..10}; do
        if curl -sf "$tenant_api_url" > /dev/null 2>&1; then
            log_success "tenant-api: healthy"
            break
        fi
        if [[ $i -eq 10 ]]; then
            log_error "tenant-api: unhealthy"
            verification_passed=false
        fi
        sleep 3
    done

    # Check platform-service health
    log_info "Checking platform-service health..."
    local platform_url="http://localhost:${PLATFORM_SERVICE_PORT:-3001}/health"

    for i in {1..10}; do
        if curl -sf "$platform_url" > /dev/null 2>&1; then
            log_success "platform-service: healthy"
            break
        fi
        if [[ $i -eq 10 ]]; then
            log_error "platform-service: unhealthy"
            verification_passed=false
        fi
        sleep 3
    done

    # Verify version
    local running_version
    running_version=$(get_current_version)
    log_info "Running version: $running_version"

    if [[ "$verification_passed" == false ]]; then
        log_error "Rollback verification failed"
        log_error "Services may be in an unhealthy state"
        return 1
    fi

    log_success "Rollback verification passed"
}

generate_rollback_report() {
    log_step "Generating rollback report"

    local report_file="${LOG_DIR}/rollback_report_${TIMESTAMP}.md"

    cat > "$report_file" << EOF
# Rollback Report

## Summary
- **Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Environment**: $ENVIRONMENT
- **Target Version**: $TARGET_VERSION
- **Status**: SUCCESS

## Services After Rollback
\`\`\`
$(cd "$PROJECT_ROOT" && docker compose ps 2>&1 || echo "Unable to get service status")
\`\`\`

## Log File
- Path: $LOG_FILE

## To Deploy Latest Again
\`\`\`bash
./scripts/deploy.sh --env $ENVIRONMENT
\`\`\`

EOF

    log_info "Report saved: $report_file"
}

# =============================================================================
# Main
# =============================================================================
main() {
    parse_args "$@"
    setup
    load_environment

    # Handle list versions
    if [[ "$LIST_VERSIONS" == true ]]; then
        get_available_versions
        exit 0
    fi

    # Determine target version
    if [[ -z "$TARGET_VERSION" ]]; then
        TARGET_VERSION=$(get_previous_version)

        if [[ -z "$TARGET_VERSION" || "$TARGET_VERSION" == "unknown" ]]; then
            log_error "No previous version found for rollback"
            log_info "Use --version to specify a version, or --list to see available versions"
            exit 1
        fi

        log_info "Auto-detected previous version: $TARGET_VERSION"
    fi

    # Validate target version
    if ! validate_version "$TARGET_VERSION"; then
        exit 1
    fi

    # Confirmation
    if [[ "$FORCE" != true && "$DRY_RUN" != true ]]; then
        local current_version
        current_version=$(get_current_version)

        log_warn "============================================="
        log_warn "ROLLBACK CONFIRMATION"
        log_warn "============================================="
        log_warn "Environment: $ENVIRONMENT"
        log_warn "Current version: $current_version"
        log_warn "Target version: $TARGET_VERSION"
        log_warn "============================================="

        if [[ "$ENVIRONMENT" == "production" ]]; then
            read -p "Type 'rollback production' to confirm: " confirm
            if [[ "$confirm" != "rollback production" ]]; then
                log_error "Rollback cancelled"
                exit 1
            fi
        else
            read -p "Proceed with rollback? (y/N): " confirm
            if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
                log_error "Rollback cancelled"
                exit 1
            fi
        fi
    fi

    # Execute rollback
    create_pre_rollback_backup
    execute_rollback
    verify_rollback
    generate_rollback_report

    log_info "============================================="
    log_success "Rollback completed successfully!"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $TARGET_VERSION"
    log_info "Log: $LOG_FILE"
    log_info "============================================="
}

main "$@"
