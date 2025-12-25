#!/bin/bash
#
# SSL Certificate Auto-Renewal Script for Let's Encrypt
# 自动续期 SSL 证书
#
# Usage:
#   ./renew-ssl-cert.sh [--force] [--dry-run]
#
# Options:
#   --force    强制续期，即使证书未到期
#   --dry-run  测试运行，不实际续期
#
# This script should be run as a cron job:
#   0 0 * * * /path/to/renew-ssl-cert.sh >> /var/log/ssl-renewal.log 2>&1
#

set -euo pipefail

# 配置
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-admin@example.com}"
WEBROOT="${WEBROOT:-/var/www/certbot}"
CERT_PATH="${CERT_PATH:-/etc/nginx/ssl}"
NGINX_CONTAINER="${NGINX_CONTAINER:-mt5-gateway-https}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}INFO${NC}: $1"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN${NC}: $1"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR${NC}: $1"
}

# 检查必要条件
check_requirements() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    if [[ -z "$DOMAIN" ]]; then
        log_error "DOMAIN environment variable is required"
        exit 1
    fi
}

# 检查证书是否需要续期
should_renew() {
    local cert_file="$CERT_PATH/live/$DOMAIN/fullchain.pem"

    if [[ ! -f "$cert_file" ]]; then
        log_info "Certificate not found, will obtain new certificate"
        return 0
    fi

    local expiry_date
    expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)

    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null)

    local current_epoch
    current_epoch=$(date +%s)

    local days_remaining
    days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))

    if [[ "$days_remaining" -le 30 ]]; then
        log_info "Certificate expires in $days_remaining days, renewal needed"
        return 0
    else
        log_info "Certificate expires in $days_remaining days, no renewal needed"
        return 1
    fi
}

# 使用 Certbot 续期证书
renew_certificate() {
    local dry_run_flag=""
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        dry_run_flag="--dry-run"
        log_info "Running in dry-run mode"
    fi

    log_info "Starting certificate renewal for $DOMAIN"

    docker run -it --rm \
        -v "$CERT_PATH:/etc/letsencrypt" \
        -v "$WEBROOT:/var/www/certbot" \
        certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN" \
        $dry_run_flag

    local result=$?

    if [[ $result -eq 0 ]]; then
        log_info "Certificate renewal successful"
        return 0
    else
        log_error "Certificate renewal failed with exit code $result"
        return 1
    fi
}

# 重载 Nginx 配置
reload_nginx() {
    log_info "Reloading Nginx configuration"

    if docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        docker exec "$NGINX_CONTAINER" nginx -s reload
        log_info "Nginx configuration reloaded"
    else
        log_warn "Nginx container '$NGINX_CONTAINER' not running, skipping reload"
    fi
}

# 发送通知
send_notification() {
    local status=$1
    local message=$2

    # 可以在这里添加 Slack、Email 等通知
    # 示例: curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"$message\"}" \
    #   "$SLACK_WEBHOOK_URL"

    if [[ "$status" == "success" ]]; then
        log_info "Notification: $message"
    else
        log_error "Notification: $message"
    fi
}

# 主函数
main() {
    local force=false
    local dry_run=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force=true
                shift
                ;;
            --dry-run)
                dry_run=true
                export DRY_RUN=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--force] [--dry-run]"
                echo ""
                echo "Options:"
                echo "  --force    Force renewal even if certificate is not expiring"
                echo "  --dry-run  Test run without actually renewing"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log_info "=== SSL Certificate Renewal Script ==="
    log_info "Domain: $DOMAIN"
    log_info "Force: $force"
    log_info "Dry Run: $dry_run"

    # 检查必要条件
    check_requirements

    # 检查是否需要续期
    if [[ "$force" == "false" ]] && ! should_renew; then
        log_info "Certificate renewal not needed at this time"
        exit 0
    fi

    # 执行续期
    if renew_certificate; then
        if [[ "$dry_run" == "false" ]]; then
            reload_nginx
            send_notification "success" "SSL certificate for $DOMAIN renewed successfully"
        fi
        log_info "=== Renewal completed successfully ==="
        exit 0
    else
        send_notification "failure" "SSL certificate renewal for $DOMAIN FAILED"
        log_error "=== Renewal failed ==="
        exit 1
    fi
}

# 执行主函数
main "$@"
