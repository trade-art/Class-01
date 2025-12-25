#!/bin/bash
#
# SSL Certificate Expiry Checker
# 检查 SSL 证书过期状态并发送告警
#
# Usage:
#   ./check-ssl-cert.sh <domain> [port] [warning_days] [critical_days]
#
# Arguments:
#   domain        - 要检查的域名或证书文件路径
#   port          - HTTPS 端口 (默认: 443)
#   warning_days  - 警告阈值天数 (默认: 30)
#   critical_days - 严重阈值天数 (默认: 7)
#
# Exit Codes:
#   0 - OK: 证书有效期超过警告阈值
#   1 - WARNING: 证书将在警告阈值内过期
#   2 - CRITICAL: 证书将在严重阈值内过期或已过期
#   3 - UNKNOWN: 无法检查证书
#
# Examples:
#   ./check-ssl-cert.sh example.com
#   ./check-ssl-cert.sh example.com 443 30 7
#   ./check-ssl-cert.sh /path/to/cert.pem
#

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_PORT=443
DEFAULT_WARNING_DAYS=30
DEFAULT_CRITICAL_DAYS=7
TIMEOUT=10

# 参数解析
DOMAIN="${1:-}"
PORT="${2:-$DEFAULT_PORT}"
WARNING_DAYS="${3:-$DEFAULT_WARNING_DAYS}"
CRITICAL_DAYS="${4:-$DEFAULT_CRITICAL_DAYS}"

# 帮助信息
show_help() {
    echo "SSL Certificate Expiry Checker"
    echo ""
    echo "Usage: $0 <domain|cert_file> [port] [warning_days] [critical_days]"
    echo ""
    echo "Arguments:"
    echo "  domain|cert_file  - Domain to check or path to certificate file"
    echo "  port              - HTTPS port (default: 443)"
    echo "  warning_days      - Warning threshold in days (default: 30)"
    echo "  critical_days     - Critical threshold in days (default: 7)"
    echo ""
    echo "Exit Codes:"
    echo "  0 - OK: Certificate is valid beyond warning threshold"
    echo "  1 - WARNING: Certificate will expire within warning threshold"
    echo "  2 - CRITICAL: Certificate will expire within critical threshold or is expired"
    echo "  3 - UNKNOWN: Unable to check certificate"
    echo ""
    echo "Examples:"
    echo "  $0 example.com"
    echo "  $0 example.com 443 30 7"
    echo "  $0 /path/to/cert.pem"
}

# 检查必要的工具
check_requirements() {
    if ! command -v openssl &> /dev/null; then
        echo "ERROR: openssl is required but not installed"
        exit 3
    fi
}

# 从域名获取证书过期时间
get_expiry_from_domain() {
    local domain=$1
    local port=$2

    local expiry_date
    expiry_date=$(echo | timeout $TIMEOUT openssl s_client -servername "$domain" -connect "$domain:$port" 2>/dev/null | \
        openssl x509 -noout -enddate 2>/dev/null | \
        cut -d= -f2)

    if [[ -z "$expiry_date" ]]; then
        echo ""
        return 1
    fi

    echo "$expiry_date"
}

# 从文件获取证书过期时间
get_expiry_from_file() {
    local cert_file=$1

    if [[ ! -f "$cert_file" ]]; then
        echo ""
        return 1
    fi

    local expiry_date
    expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)

    if [[ -z "$expiry_date" ]]; then
        echo ""
        return 1
    fi

    echo "$expiry_date"
}

# 计算剩余天数
calculate_days_remaining() {
    local expiry_date=$1

    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null)

    if [[ -z "$expiry_epoch" ]]; then
        echo "-1"
        return 1
    fi

    local current_epoch
    current_epoch=$(date +%s)

    local days_remaining
    days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))

    echo "$days_remaining"
}

# 获取证书信息
get_cert_info() {
    local domain=$1
    local port=$2

    echo | timeout $TIMEOUT openssl s_client -servername "$domain" -connect "$domain:$port" 2>/dev/null | \
        openssl x509 -noout -subject -issuer 2>/dev/null
}

# 主函数
main() {
    # 检查参数
    if [[ -z "$DOMAIN" ]] || [[ "$DOMAIN" == "-h" ]] || [[ "$DOMAIN" == "--help" ]]; then
        show_help
        exit 0
    fi

    # 检查依赖
    check_requirements

    local expiry_date=""
    local is_file=false

    # 判断是域名还是文件
    if [[ -f "$DOMAIN" ]]; then
        is_file=true
        expiry_date=$(get_expiry_from_file "$DOMAIN")
    else
        expiry_date=$(get_expiry_from_domain "$DOMAIN" "$PORT")
    fi

    # 检查是否获取到过期时间
    if [[ -z "$expiry_date" ]]; then
        echo -e "${RED}UNKNOWN${NC} - Unable to retrieve certificate expiry for $DOMAIN"
        exit 3
    fi

    # 计算剩余天数
    local days_remaining
    days_remaining=$(calculate_days_remaining "$expiry_date")

    if [[ "$days_remaining" == "-1" ]]; then
        echo -e "${RED}UNKNOWN${NC} - Unable to calculate days remaining"
        exit 3
    fi

    # 输出检查源
    local source_info
    if [[ "$is_file" == true ]]; then
        source_info="File: $DOMAIN"
    else
        source_info="Domain: $DOMAIN:$PORT"
    fi

    # 输出 Prometheus 格式的指标
    echo "# HELP ssl_certificate_expiry_days Days until SSL certificate expires"
    echo "# TYPE ssl_certificate_expiry_days gauge"
    if [[ "$is_file" == true ]]; then
        echo "ssl_certificate_expiry_days{source=\"file\",path=\"$DOMAIN\"} $days_remaining"
    else
        echo "ssl_certificate_expiry_days{source=\"domain\",domain=\"$DOMAIN\",port=\"$PORT\"} $days_remaining"
    fi
    echo ""

    # 判断状态并输出
    if [[ "$days_remaining" -lt 0 ]]; then
        echo -e "${RED}CRITICAL${NC} - $source_info"
        echo "Certificate EXPIRED on: $expiry_date"
        echo "Days expired: $((-days_remaining))"
        exit 2
    elif [[ "$days_remaining" -le "$CRITICAL_DAYS" ]]; then
        echo -e "${RED}CRITICAL${NC} - $source_info"
        echo "Certificate expires: $expiry_date"
        echo "Days remaining: $days_remaining (critical threshold: $CRITICAL_DAYS)"
        exit 2
    elif [[ "$days_remaining" -le "$WARNING_DAYS" ]]; then
        echo -e "${YELLOW}WARNING${NC} - $source_info"
        echo "Certificate expires: $expiry_date"
        echo "Days remaining: $days_remaining (warning threshold: $WARNING_DAYS)"
        exit 1
    else
        echo -e "${GREEN}OK${NC} - $source_info"
        echo "Certificate expires: $expiry_date"
        echo "Days remaining: $days_remaining"
        exit 0
    fi
}

# 执行主函数
main
