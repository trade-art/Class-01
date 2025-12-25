#!/bin/bash
# =============================================================================
# MT5 Platform - SSL Certificate Generation Script
# Supports self-signed (development) and Let's Encrypt (production)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SSL_DIR="${PROJECT_ROOT}/docker/nginx/ssl"
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${EMAIL:-admin@example.com}"

# Ensure SSL directory exists
mkdir -p "$SSL_DIR"

# Print colored message
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show usage
show_help() {
    echo "MT5 Platform SSL Certificate Generator"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  self-signed       Generate self-signed certificate (development)"
    echo "  letsencrypt       Generate Let's Encrypt certificate (production)"
    echo "  renew             Renew Let's Encrypt certificate"
    echo "  verify            Verify current certificate"
    echo "  clean             Remove all certificates"
    echo ""
    echo "Options:"
    echo "  --domain DOMAIN   Domain name (default: localhost)"
    echo "  --email EMAIL     Email for Let's Encrypt (required for letsencrypt)"
    echo "  --staging         Use Let's Encrypt staging environment"
    echo ""
    echo "Examples:"
    echo "  $0 self-signed                          # Generate self-signed cert for localhost"
    echo "  $0 self-signed --domain mt5.local       # Generate self-signed cert for mt5.local"
    echo "  $0 letsencrypt --domain mt5.example.com --email admin@example.com"
    echo "  $0 renew                                # Renew Let's Encrypt certificate"
}

# Generate self-signed certificate
generate_self_signed() {
    log_info "Generating self-signed certificate for domain: $DOMAIN"

    # Generate private key
    openssl genrsa -out "${SSL_DIR}/privkey.pem" 4096

    # Create certificate configuration
    cat > "${SSL_DIR}/cert.conf" << EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_ext

[dn]
C = CN
ST = Shanghai
L = Shanghai
O = MT5 Platform
OU = Development
CN = ${DOMAIN}

[v3_ext]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = *.${DOMAIN}
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
EOF

    # Generate certificate
    openssl req -new -x509 -days 365 \
        -key "${SSL_DIR}/privkey.pem" \
        -out "${SSL_DIR}/fullchain.pem" \
        -config "${SSL_DIR}/cert.conf"

    # Create symbolic links for compatibility
    ln -sf fullchain.pem "${SSL_DIR}/cert.pem"
    ln -sf privkey.pem "${SSL_DIR}/key.pem"

    # Set permissions
    chmod 600 "${SSL_DIR}/privkey.pem"
    chmod 644 "${SSL_DIR}/fullchain.pem"

    log_success "Self-signed certificate generated successfully!"
    log_info "Certificate location: ${SSL_DIR}/fullchain.pem"
    log_info "Private key location: ${SSL_DIR}/privkey.pem"
    log_warning "This is a self-signed certificate. Browsers will show security warnings."

    # Verify certificate
    verify_certificate
}

# Generate Let's Encrypt certificate
generate_letsencrypt() {
    log_info "Generating Let's Encrypt certificate for domain: $DOMAIN"

    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log_error "certbot is not installed. Please install it first:"
        echo "  Ubuntu/Debian: sudo apt-get install certbot"
        echo "  CentOS/RHEL: sudo yum install certbot"
        echo "  macOS: brew install certbot"
        exit 1
    fi

    # Check if email is provided
    if [ "$EMAIL" == "admin@example.com" ]; then
        log_error "Please provide a valid email with --email option"
        exit 1
    fi

    # Build certbot command
    CERTBOT_CMD="certbot certonly --standalone"
    CERTBOT_CMD+=" -d $DOMAIN"
    CERTBOT_CMD+=" --email $EMAIL"
    CERTBOT_CMD+=" --agree-tos"
    CERTBOT_CMD+=" --non-interactive"

    if [ "$STAGING" == "true" ]; then
        CERTBOT_CMD+=" --staging"
        log_warning "Using Let's Encrypt staging environment"
    fi

    # Run certbot
    log_info "Running certbot..."
    eval $CERTBOT_CMD

    # Copy certificates to our SSL directory
    LETSENCRYPT_DIR="/etc/letsencrypt/live/$DOMAIN"

    if [ -d "$LETSENCRYPT_DIR" ]; then
        cp "$LETSENCRYPT_DIR/fullchain.pem" "${SSL_DIR}/fullchain.pem"
        cp "$LETSENCRYPT_DIR/privkey.pem" "${SSL_DIR}/privkey.pem"
        ln -sf fullchain.pem "${SSL_DIR}/cert.pem"
        ln -sf privkey.pem "${SSL_DIR}/key.pem"

        chmod 600 "${SSL_DIR}/privkey.pem"
        chmod 644 "${SSL_DIR}/fullchain.pem"

        log_success "Let's Encrypt certificate generated successfully!"
        verify_certificate
    else
        log_error "Certificate generation failed. Check certbot output above."
        exit 1
    fi
}

# Renew Let's Encrypt certificate
renew_letsencrypt() {
    log_info "Renewing Let's Encrypt certificate..."

    if ! command -v certbot &> /dev/null; then
        log_error "certbot is not installed"
        exit 1
    fi

    # Renew certificate
    certbot renew --non-interactive

    # Copy renewed certificates
    if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
        LETSENCRYPT_DIR="/etc/letsencrypt/live/$DOMAIN"

        if [ -d "$LETSENCRYPT_DIR" ]; then
            cp "$LETSENCRYPT_DIR/fullchain.pem" "${SSL_DIR}/fullchain.pem"
            cp "$LETSENCRYPT_DIR/privkey.pem" "${SSL_DIR}/privkey.pem"

            log_success "Certificate renewed successfully!"

            # Reload nginx if running
            if docker ps | grep -q mt5-gateway; then
                log_info "Reloading Nginx..."
                docker exec mt5-gateway nginx -s reload
                log_success "Nginx reloaded"
            fi
        fi
    else
        log_warning "No domain configured, cannot renew"
    fi
}

# Verify certificate
verify_certificate() {
    log_info "Verifying certificate..."

    CERT_FILE="${SSL_DIR}/fullchain.pem"

    if [ ! -f "$CERT_FILE" ]; then
        log_error "Certificate not found: $CERT_FILE"
        exit 1
    fi

    echo ""
    echo "Certificate Information:"
    echo "========================"
    openssl x509 -in "$CERT_FILE" -noout -subject -issuer -dates
    echo ""

    # Check expiration
    EXPIRY=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

    if [ $DAYS_LEFT -lt 0 ]; then
        log_error "Certificate has EXPIRED!"
    elif [ $DAYS_LEFT -lt 30 ]; then
        log_warning "Certificate expires in $DAYS_LEFT days. Consider renewing soon."
    else
        log_success "Certificate is valid for $DAYS_LEFT more days."
    fi
}

# Clean all certificates
clean_certificates() {
    log_warning "This will remove all SSL certificates!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f "${SSL_DIR}"/*.pem
        rm -f "${SSL_DIR}/cert.conf"
        log_success "All certificates removed"
    else
        log_info "Operation cancelled"
    fi
}

# Generate DH parameters (for enhanced security)
generate_dhparam() {
    log_info "Generating DH parameters (this may take a while)..."
    openssl dhparam -out "${SSL_DIR}/dhparam.pem" 4096
    chmod 644 "${SSL_DIR}/dhparam.pem"
    log_success "DH parameters generated: ${SSL_DIR}/dhparam.pem"
}

# Parse command line arguments
STAGING="false"
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        self-signed|letsencrypt|renew|verify|clean|dhparam)
            COMMAND="$1"
            shift
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --staging)
            STAGING="true"
            shift
            ;;
        --help|-h)
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

# Execute command
case $COMMAND in
    self-signed)
        generate_self_signed
        ;;
    letsencrypt)
        generate_letsencrypt
        ;;
    renew)
        renew_letsencrypt
        ;;
    verify)
        verify_certificate
        ;;
    clean)
        clean_certificates
        ;;
    dhparam)
        generate_dhparam
        ;;
    *)
        show_help
        exit 1
        ;;
esac
