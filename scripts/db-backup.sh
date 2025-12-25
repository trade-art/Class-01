#!/bin/bash
# =============================================================================
# MT5 Platform - Database Backup Script
# =============================================================================
# Usage: ./scripts/db-backup.sh [options]
#
# Options:
#   --env             Environment (development|staging|production)
#   --pre-migration   Mark backup as pre-migration backup
#   --output          Custom output directory
#   --compress        Compression level (0-9, default: 6)
#   --retention       Days to keep backups (default: 30)
#   --s3-upload       Upload to S3 after backup
#   --list            List existing backups
#   --restore         Restore from backup file
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups/db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
ENVIRONMENT="${NODE_ENV:-development}"
PRE_MIGRATION=false
OUTPUT_DIR=""
COMPRESS_LEVEL=6
RETENTION_DAYS=30
S3_UPLOAD=false
LIST_BACKUPS=false
RESTORE_FILE=""

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
            --pre-migration)
                PRE_MIGRATION=true
                shift
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --output=*)
                OUTPUT_DIR="${1#*=}"
                shift
                ;;
            --compress)
                COMPRESS_LEVEL="$2"
                shift 2
                ;;
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --s3-upload)
                S3_UPLOAD=true
                shift
                ;;
            --list)
                LIST_BACKUPS=true
                shift
                ;;
            --restore)
                RESTORE_FILE="$2"
                shift 2
                ;;
            --restore=*)
                RESTORE_FILE="${1#*=}"
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
MT5 Platform Database Backup Script

Usage: ./scripts/db-backup.sh [options]

Options:
  --env <env>       Environment (development|staging|production)
  --pre-migration   Mark as pre-migration backup
  --output <dir>    Custom output directory
  --compress <0-9>  Compression level (default: 6)
  --retention <N>   Days to keep backups (default: 30)
  --s3-upload       Upload to S3 after backup
  --list            List existing backups
  --restore <file>  Restore from backup file
  -h, --help        Show this help message

Examples:
  ./scripts/db-backup.sh --env production
  ./scripts/db-backup.sh --pre-migration --env production
  ./scripts/db-backup.sh --list
  ./scripts/db-backup.sh --restore backups/db/backup_20240101_120000.sql.gz

Environment Variables:
  DATABASE_URL        PostgreSQL connection string (required)
  BACKUP_S3_BUCKET    S3 bucket for remote backups
  BACKUP_S3_PREFIX    S3 prefix/folder for backups
  AWS_ACCESS_KEY_ID   AWS access key (for S3 upload)
  AWS_SECRET_ACCESS_KEY  AWS secret key (for S3 upload)

EOF
}

# =============================================================================
# Setup Functions
# =============================================================================
setup() {
    # Set output directory
    if [[ -z "$OUTPUT_DIR" ]]; then
        OUTPUT_DIR="$BACKUP_DIR"
    fi

    mkdir -p "$OUTPUT_DIR"

    log_info "Output directory: $OUTPUT_DIR"
}

load_environment() {
    log_info "Loading environment: $ENVIRONMENT"

    local env_file="${PROJECT_ROOT}/config/.env.${ENVIRONMENT}"

    if [[ -f "$env_file" ]]; then
        # shellcheck source=/dev/null
        source "$env_file"
        log_info "Loaded environment from: $env_file"
    fi

    # Validate required variables
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL is not set"
        exit 1
    fi
}

parse_database_url() {
    # Parse PostgreSQL URL: postgresql://user:password@host:port/database?options
    local url="$DATABASE_URL"

    # Remove protocol
    url="${url#postgresql://}"
    url="${url#postgres://}"

    # Extract credentials
    if [[ "$url" == *"@"* ]]; then
        local creds="${url%%@*}"
        url="${url#*@}"

        DB_USER="${creds%%:*}"
        DB_PASSWORD="${creds#*:}"
    fi

    # Extract host:port/database
    local host_part="${url%%/*}"
    local db_part="${url#*/}"

    # Remove query string from database
    DB_NAME="${db_part%%\?*}"

    # Extract host and port
    if [[ "$host_part" == *":"* ]]; then
        DB_HOST="${host_part%%:*}"
        DB_PORT="${host_part#*:}"
    else
        DB_HOST="$host_part"
        DB_PORT="5432"
    fi

    log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for pg_dump
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump is not installed. Please install PostgreSQL client."
        exit 1
    fi

    # Check for gzip
    if ! command -v gzip &> /dev/null; then
        log_error "gzip is not installed."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# =============================================================================
# Backup Functions
# =============================================================================
list_backups() {
    log_info "Listing backups in: $OUTPUT_DIR"
    echo ""

    if [[ ! -d "$OUTPUT_DIR" ]]; then
        log_warn "Backup directory does not exist"
        exit 0
    fi

    local count=0
    echo "Date                 | Size       | Filename"
    echo "---------------------|------------|------------------------------------------"

    while IFS= read -r file; do
        if [[ -n "$file" ]]; then
            local size=$(du -h "$file" 2>/dev/null | cut -f1)
            local name=$(basename "$file")
            local date=$(stat -c %y "$file" 2>/dev/null | cut -d'.' -f1 || stat -f %Sm "$file" 2>/dev/null)
            printf "%-20s | %-10s | %s\n" "$date" "$size" "$name"
            ((count++))
        fi
    done < <(find "$OUTPUT_DIR" -name "*.sql.gz" -type f 2>/dev/null | sort -r)

    echo ""
    log_info "Total backups: $count"
}

create_backup() {
    local backup_type="manual"
    if [[ "$PRE_MIGRATION" == true ]]; then
        backup_type="pre_migration"
    fi

    local backup_name="${ENVIRONMENT}_${backup_type}_${TIMESTAMP}"
    local backup_file="${OUTPUT_DIR}/${backup_name}.sql"
    local compressed_file="${backup_file}.gz"

    log_info "Creating backup: ${backup_name}"

    # Set PGPASSWORD for pg_dump
    export PGPASSWORD="$DB_PASSWORD"

    # Create backup with pg_dump
    log_info "Running pg_dump..."

    local pg_dump_opts=(
        -h "$DB_HOST"
        -p "$DB_PORT"
        -U "$DB_USER"
        -d "$DB_NAME"
        -F p           # Plain text format
        -b             # Include large objects
        -v             # Verbose
        --no-owner     # Don't output ownership commands
        --no-acl       # Don't output access control commands
    )

    if pg_dump "${pg_dump_opts[@]}" > "$backup_file" 2>&1; then
        log_success "pg_dump completed"
    else
        log_error "pg_dump failed"
        rm -f "$backup_file"
        exit 1
    fi

    # Compress backup
    log_info "Compressing backup (level: $COMPRESS_LEVEL)..."
    if gzip -"$COMPRESS_LEVEL" "$backup_file"; then
        log_success "Compression completed"
    else
        log_error "Compression failed"
        exit 1
    fi

    # Get backup size
    local size=$(du -h "$compressed_file" | cut -f1)
    log_success "Backup created: $compressed_file ($size)"

    # Create metadata file
    local metadata_file="${OUTPUT_DIR}/${backup_name}.json"
    cat > "$metadata_file" << EOF
{
    "name": "${backup_name}",
    "file": "${compressed_file}",
    "environment": "${ENVIRONMENT}",
    "type": "${backup_type}",
    "database": "${DB_NAME}",
    "host": "${DB_HOST}",
    "timestamp": "${TIMESTAMP}",
    "created_at": "$(date -Iseconds)",
    "size_bytes": $(stat -c %s "$compressed_file" 2>/dev/null || stat -f %z "$compressed_file" 2>/dev/null),
    "compression_level": ${COMPRESS_LEVEL}
}
EOF

    log_info "Metadata saved: $metadata_file"

    # Upload to S3 if requested
    if [[ "$S3_UPLOAD" == true ]]; then
        upload_to_s3 "$compressed_file" "$metadata_file"
    fi

    # Clean old backups
    cleanup_old_backups

    echo "$compressed_file"
}

restore_backup() {
    local restore_file="$1"

    if [[ ! -f "$restore_file" ]]; then
        log_error "Backup file not found: $restore_file"
        exit 1
    fi

    log_warn "============================================="
    log_warn "WARNING: This will REPLACE the current database!"
    log_warn "Environment: $ENVIRONMENT"
    log_warn "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    log_warn "Backup file: $restore_file"
    log_warn "============================================="

    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warn "You are about to restore a PRODUCTION database!"
        read -p "Type 'RESTORE PRODUCTION' to confirm: " confirm
        if [[ "$confirm" != "RESTORE PRODUCTION" ]]; then
            log_error "Restore cancelled"
            exit 1
        fi
    else
        read -p "Are you sure? (y/N): " confirm
        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            log_error "Restore cancelled"
            exit 1
        fi
    fi

    log_info "Starting database restore..."

    # Set PGPASSWORD
    export PGPASSWORD="$DB_PASSWORD"

    # Decompress if needed
    local sql_file="$restore_file"
    local temp_file=""

    if [[ "$restore_file" == *.gz ]]; then
        log_info "Decompressing backup..."
        temp_file="/tmp/restore_${TIMESTAMP}.sql"
        gunzip -c "$restore_file" > "$temp_file"
        sql_file="$temp_file"
    fi

    # Restore database
    log_info "Restoring database..."

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$sql_file"; then
        log_success "Database restored successfully"
    else
        log_error "Database restore failed"
        [[ -n "$temp_file" ]] && rm -f "$temp_file"
        exit 1
    fi

    # Cleanup temp file
    [[ -n "$temp_file" ]] && rm -f "$temp_file"

    log_success "Restore completed!"
}

upload_to_s3() {
    local backup_file="$1"
    local metadata_file="$2"

    if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
        log_warn "BACKUP_S3_BUCKET not set, skipping S3 upload"
        return 0
    fi

    if ! command -v aws &> /dev/null; then
        log_warn "AWS CLI not installed, skipping S3 upload"
        return 0
    fi

    local s3_prefix="${BACKUP_S3_PREFIX:-mt5-platform/backups}"
    local s3_path="s3://${BACKUP_S3_BUCKET}/${s3_prefix}/${ENVIRONMENT}/"

    log_info "Uploading to S3: $s3_path"

    # Upload backup file
    if aws s3 cp "$backup_file" "${s3_path}$(basename "$backup_file")"; then
        log_success "Backup uploaded to S3"
    else
        log_error "Failed to upload backup to S3"
        return 1
    fi

    # Upload metadata
    if aws s3 cp "$metadata_file" "${s3_path}$(basename "$metadata_file")"; then
        log_success "Metadata uploaded to S3"
    else
        log_warn "Failed to upload metadata to S3"
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted=0

    # Find and delete old backup files
    while IFS= read -r file; do
        if [[ -n "$file" ]]; then
            rm -f "$file"
            rm -f "${file%.sql.gz}.json"  # Also remove metadata
            ((deleted++))
            log_info "Deleted: $(basename "$file")"
        fi
    done < <(find "$OUTPUT_DIR" -name "*.sql.gz" -type f -mtime +"$RETENTION_DAYS" 2>/dev/null)

    log_info "Cleaned up $deleted old backup(s)"
}

# =============================================================================
# Main
# =============================================================================
main() {
    parse_args "$@"

    log_info "============================================="
    log_info "MT5 Platform Database Backup"
    log_info "============================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $TIMESTAMP"
    log_info "============================================="

    setup
    load_environment
    parse_database_url

    # Handle list backups
    if [[ "$LIST_BACKUPS" == true ]]; then
        list_backups
        exit 0
    fi

    check_prerequisites

    # Handle restore
    if [[ -n "$RESTORE_FILE" ]]; then
        restore_backup "$RESTORE_FILE"
        exit 0
    fi

    # Create backup
    local backup_path
    backup_path=$(create_backup)

    log_info "============================================="
    log_success "Backup completed successfully!"
    log_info "File: $backup_path"
    log_info "============================================="
}

main "$@"
