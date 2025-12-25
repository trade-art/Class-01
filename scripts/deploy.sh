#!/bin/bash
# =============================================================================
# MT5 Platform - Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh [options]
#
# Options:
#   --env           Environment (development|staging|production)
#   --version       Version/tag to deploy (default: latest)
#   --skip-build    Skip Docker image build
#   --skip-migrate  Skip database migration
#   --skip-tests    Skip post-deployment tests
#   --dry-run       Show what would be deployed without executing
#   --force         Force deployment even with warnings
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
LOG_FILE="${LOG_DIR}/deploy_${TIMESTAMP}.log"

# Default values
ENVIRONMENT="development"
VERSION="latest"
SKIP_BUILD=false
SKIP_MIGRATE=false
SKIP_TESTS=false
DRY_RUN=false
FORCE=false

# Docker settings
REGISTRY="${DOCKER_REGISTRY:-ghcr.io}"
IMAGE_PREFIX="${IMAGE_PREFIX:-mt5-platform}"

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
                VERSION="$2"
                shift 2
                ;;
            --version=*)
                VERSION="${1#*=}"
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-migrate)
                SKIP_MIGRATE=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
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
        log_error "Must be one of: development, staging, production"
        exit 1
    fi
}

show_help() {
    cat << EOF
MT5 Platform Deployment Script

Usage: ./scripts/deploy.sh [options]

Options:
  --env <env>      Environment: development|staging|production (default: development)
  --version <ver>  Version/tag to deploy (default: latest)
  --skip-build     Skip Docker image build
  --skip-migrate   Skip database migration
  --skip-tests     Skip post-deployment tests
  --dry-run        Show what would be deployed without executing
  --force          Force deployment even with warnings
  -h, --help       Show this help message

Examples:
  ./scripts/deploy.sh --env development
  ./scripts/deploy.sh --env staging --version v1.0.0
  ./scripts/deploy.sh --env production --version v1.0.0 --force
  ./scripts/deploy.sh --dry-run

EOF
}

# =============================================================================
# Setup Functions
# =============================================================================
setup() {
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"

    log_info "============================================="
    log_info "MT5 Platform Deployment"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    log_info "Timestamp: $TIMESTAMP"
    log_info "Log file: $LOG_FILE"
    log_info "============================================="
}

load_environment() {
    log_step "Loading environment configuration"

    local env_file="${PROJECT_ROOT}/config/.env.${ENVIRONMENT}"

    if [[ -f "$env_file" ]]; then
        # shellcheck source=/dev/null
        source "$env_file"
        log_success "Loaded: $env_file"
    else
        log_warn "Environment file not found: $env_file"
    fi

    # Set version
    export APP_VERSION="$VERSION"
}

# =============================================================================
# Pre-deployment Checks
# =============================================================================
pre_deployment_checks() {
    log_step "Running pre-deployment checks"

    local checks_passed=true

    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        checks_passed=false
    else
        log_success "Docker: Running"
    fi

    # Check docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "docker-compose is not installed"
        checks_passed=false
    else
        log_success "docker-compose: Available"
    fi

    # Check required files exist
    local required_files=(
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "docker/Dockerfile.tenant-api"
        "docker/Dockerfile.platform-service"
    )

    for file in "${required_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${file}" ]]; then
            log_success "File exists: $file"
        else
            log_error "Missing file: $file"
            checks_passed=false
        fi
    done

    # Check environment-specific requirements
    if [[ "$ENVIRONMENT" == "production" ]]; then
        # Check required secrets
        local required_vars=("JWT_SECRET" "DATABASE_URL")
        for var in "${required_vars[@]}"; do
            if [[ -z "${!var:-}" ]]; then
                log_warn "Required variable not set: $var"
            fi
        done
    fi

    # Check disk space (minimum 5GB free)
    local free_space
    free_space=$(df -BG "${PROJECT_ROOT}" | tail -1 | awk '{print $4}' | tr -d 'G')
    if [[ "$free_space" -lt 5 ]]; then
        log_warn "Low disk space: ${free_space}GB free (recommend 5GB+)"
    else
        log_success "Disk space: ${free_space}GB free"
    fi

    if [[ "$checks_passed" == false && "$FORCE" != true ]]; then
        log_error "Pre-deployment checks failed. Use --force to proceed anyway."
        exit 1
    fi
}

# =============================================================================
# Build Functions
# =============================================================================
build_images() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log_warn "Skipping image build (--skip-build flag)"
        return 0
    fi

    log_step "Building Docker images"

    cd "$PROJECT_ROOT"

    local compose_files="-f docker-compose.yml"
    if [[ "$ENVIRONMENT" != "development" ]]; then
        compose_files="$compose_files -f docker-compose.prod.yml"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would build images with:"
        log_info "  docker compose $compose_files build"
        return 0
    fi

    # Build images
    log_info "Building tenant-api..."
    docker compose $compose_files build tenant-api 2>&1 | tee -a "$LOG_FILE"

    log_info "Building platform-service..."
    docker compose $compose_files build platform-service 2>&1 | tee -a "$LOG_FILE"

    log_success "Docker images built successfully"
}

# =============================================================================
# Database Migration
# =============================================================================
run_migrations() {
    if [[ "$SKIP_MIGRATE" == true ]]; then
        log_warn "Skipping database migration (--skip-migrate flag)"
        return 0
    fi

    log_step "Running database migrations"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would run database migrations"
        return 0
    fi

    if [[ -x "${SCRIPT_DIR}/db-migrate.sh" ]]; then
        "${SCRIPT_DIR}/db-migrate.sh" --env "$ENVIRONMENT" || {
            log_error "Database migration failed"
            if [[ "$FORCE" != true ]]; then
                exit 1
            fi
        }
        log_success "Database migrations completed"
    else
        log_warn "Migration script not found or not executable"
    fi
}

# =============================================================================
# Deployment
# =============================================================================
deploy_services() {
    log_step "Deploying services"

    cd "$PROJECT_ROOT"

    local compose_files="-f docker-compose.yml"
    if [[ "$ENVIRONMENT" != "development" ]]; then
        compose_files="$compose_files -f docker-compose.prod.yml"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would deploy with:"
        log_info "  docker compose $compose_files up -d"
        return 0
    fi

    # Pull latest images (if using registry)
    if [[ "$SKIP_BUILD" == true ]]; then
        log_info "Pulling latest images..."
        docker compose $compose_files pull 2>&1 | tee -a "$LOG_FILE" || true
    fi

    # Start infrastructure services first
    log_info "Starting infrastructure services..."
    docker compose $compose_files up -d postgres redis 2>&1 | tee -a "$LOG_FILE"

    # Wait for infrastructure to be healthy
    log_info "Waiting for infrastructure to be healthy..."
    local max_wait=60
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
        if docker compose $compose_files ps postgres 2>&1 | grep -q "healthy"; then
            break
        fi
        sleep 5
        waited=$((waited + 5))
        log_info "Waiting for postgres... (${waited}s/${max_wait}s)"
    done

    # Start application services
    log_info "Starting application services..."
    docker compose $compose_files up -d tenant-api platform-service 2>&1 | tee -a "$LOG_FILE"

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10

    # Show deployment status
    log_info "Deployment status:"
    docker compose $compose_files ps 2>&1 | tee -a "$LOG_FILE"

    log_success "Services deployed successfully"
}

# =============================================================================
# Post-deployment Verification
# =============================================================================
verify_deployment() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_warn "Skipping post-deployment verification (--skip-tests flag)"
        return 0
    fi

    log_step "Verifying deployment"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would verify deployment health"
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

    # Run verification script if exists
    if [[ -x "${SCRIPT_DIR}/db-verify.sh" ]]; then
        log_info "Running database verification..."
        "${SCRIPT_DIR}/db-verify.sh" --env "$ENVIRONMENT" --check schema || {
            log_warn "Database verification had warnings"
        }
    fi

    if [[ "$verification_passed" == false ]]; then
        log_error "Deployment verification failed"
        log_warn "Consider running rollback: ./scripts/rollback.sh --env $ENVIRONMENT"
        return 1
    fi

    log_success "Deployment verification passed"
}

# =============================================================================
# Post-deployment Report
# =============================================================================
generate_report() {
    log_step "Generating deployment report"

    local report_file="${LOG_DIR}/deploy_report_${TIMESTAMP}.md"

    cat > "$report_file" << EOF
# Deployment Report

## Summary
- **Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Environment**: $ENVIRONMENT
- **Version**: $VERSION
- **Status**: SUCCESS

## Configuration
- Skip Build: $SKIP_BUILD
- Skip Migrate: $SKIP_MIGRATE
- Skip Tests: $SKIP_TESTS
- Dry Run: $DRY_RUN
- Force: $FORCE

## Services Deployed
\`\`\`
$(cd "$PROJECT_ROOT" && docker compose ps 2>&1 || echo "Unable to get service status")
\`\`\`

## Docker Images
\`\`\`
$(docker images | grep -E "mt5-(tenant-api|platform-service)" | head -10 || echo "No images found")
\`\`\`

## Log File
- Path: $LOG_FILE

## Rollback Command
\`\`\`bash
./scripts/rollback.sh --env $ENVIRONMENT
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

    # Confirmation for production
    if [[ "$ENVIRONMENT" == "production" && "$FORCE" != true && "$DRY_RUN" != true ]]; then
        log_warn "============================================="
        log_warn "WARNING: You are deploying to PRODUCTION!"
        log_warn "============================================="
        log_warn "Version: $VERSION"
        read -p "Type 'deploy production' to confirm: " confirm
        if [[ "$confirm" != "deploy production" ]]; then
            log_error "Deployment cancelled"
            exit 1
        fi
    fi

    # Execute deployment steps
    pre_deployment_checks
    build_images
    run_migrations
    deploy_services
    verify_deployment
    generate_report

    log_info "============================================="
    log_success "Deployment completed successfully!"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    log_info "Log: $LOG_FILE"
    log_info "============================================="
}

main "$@"
